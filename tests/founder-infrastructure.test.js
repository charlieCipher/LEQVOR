// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createPeerAdmission} from '../governance/control/admission.mjs';
import {postgresTransactions,TransactionOutcomeUnknown} from '../governance/pool-database.mjs';

it('bounds peer bursts, ignores forwarded identity, clamps clock rollback and bounds peer storage',()=>{
 let now=10000;const admit=createPeerAdmission({capacity:2,refillPerSecond:1,maxPeers:2,idleMs:5000,clock:()=>now});
 const peer=address=>({socket:{remoteAddress:address},headers:{'x-forwarded-for':Math.random().toString()}});
 expect(admit(peer('A'))).toBe(true);expect(admit(peer('A'))).toBe(true);expect(admit(peer('A'))).toBe(false);
 now=9000;expect(admit(peer('A'))).toBe(false);now=11000;expect(admit(peer('A'))).toBe(true);
 expect(admit(peer('B'))).toBe(true);expect(admit(peer('C'))).toBe(false);expect(admit({headers:{'x-forwarded-for':'D'}})).toBe(false);
 now=17000;expect(admit(peer('C'))).toBe(true);
});
function poolFixture(fail){const query=vi.fn(async sql=>{if(sql===fail)throw new Error('connection lost');return {rows:[]};}),release=vi.fn(),pool={connect:vi.fn(async()=>({query,release})),query:vi.fn()};return {query,release,pool};}
it('runs all statements on one bounded checked-out transaction connection',async()=>{
 const f=poolFixture();expect(await postgresTransactions(f.pool).transaction(async tx=>{await tx.query('SELECT $1',[42]);return 'result';})).toBe('result');
 expect(f.pool.connect).toHaveBeenCalledTimes(1);expect(f.pool.query).not.toHaveBeenCalled();expect(f.query.mock.calls.map(c=>c[0])).toEqual(['BEGIN',"SET LOCAL statement_timeout = '10s'","SET LOCAL lock_timeout = '3s'","SET LOCAL idle_in_transaction_session_timeout = '15s'",'SELECT $1','COMMIT']);expect(f.release).toHaveBeenCalledWith(false);
});
it('rolls back work failures and never retries an ambiguous commit',async()=>{
 const f=poolFixture('SELECT fail');await expect(postgresTransactions(f.pool).transaction(tx=>tx.query('SELECT fail'))).rejects.toThrow('connection lost');expect(f.query).toHaveBeenCalledWith('ROLLBACK');expect(f.pool.connect).toHaveBeenCalledTimes(1);
 const g=poolFixture('COMMIT');await expect(postgresTransactions(g.pool).transaction(async()=> 'done')).rejects.toBeInstanceOf(TransactionOutcomeUnknown);expect(g.release).toHaveBeenCalledWith(true);expect(g.pool.connect).toHaveBeenCalledTimes(1);
});
