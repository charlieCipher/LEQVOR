// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {GovernanceEngine,initialGovernance,checkpoint} from '../governance/engine.mjs';
import {hash,encode,approvalCommitment} from '../governance/protocol.mjs';
import {PostgresExecutionJournal} from '../governance/execution-journal.mjs';
import {RootExecutionCoordinator} from '../governance/executor.mjs';

const databases=[];afterEach(async()=>{for(const db of databases.splice(0))await db.close();});
async function fixture(){
 const keys=['A','B','C'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)};let state=initialGovernance(policy),head=checkpoint(state),now=Date.parse('2026-10-13T12:00:00Z');
 const engine=new GovernanceEngine({transaction:async operation=>{const next=structuredClone(state),result=await operation(next);state=next;return result;}},{clock:()=>now,policyPin:async()=>hash(policy)});
 const run=async operation=>{const response=await operation(head);head=response.checkpoint;return response.result;};
 const approve=(request,slot)=>{const k=keys.find(k=>k.pin.slot===slot);return {slot,key_id:k.pin.key_id,signature:sign('sha256',encode(approvalCommitment(request,k.pin.key_id)),{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};};
 const target={owner:'public-test-owner'},proposal=await run(a=>engine.request({action:'TRANSFER_PLATFORM_OWNERSHIP',target:hash(target)},a));
 for(const slot of ['A','B'])await run(a=>engine.approve(proposal.request_id,approve(proposal,slot),a));now+=259200000;
 const confirmation=await run(a=>engine.request({action:proposal.action,target:proposal.target,proposal_id:proposal.request_id},a));for(const slot of ['A','C'])await run(a=>engine.approve(confirmation.request_id,approve(confirmation,slot),a));
 const db=new PGlite();databases.push(db);for(const path of ['001_founder_state.sql','002_execution_journal.sql'])await db.exec(await readFile(`governance/migrations/${path}`,'utf8'));
 const journal=new PostgresExecutionJournal(db,{clock:()=>now}),proofs=new Map();
 function apply(intent,outcome='APPLIED'){const receipt={domain:'leqvor-root-provider-receipt-v1',idempotency_key:intent.idempotency_key,action:intent.action,target_hash:intent.target_hash,operation_id:'simulated-independent-operation',outcome,observed_at:new Date(now).toISOString(),evidence_hash:hash({operation:intent.idempotency_key,outcome})};proofs.set(intent.idempotency_key,receipt);return receipt;}
 const adapter={enforcement:'independent-live-root-fence-v1',execute:vi.fn(async({intent})=>apply(intent)),lookupReceipt:vi.fn(async({intent})=>proofs.get(intent.idempotency_key)),verifyReceipt:vi.fn(async({intent,receipt})=>hash(proofs.get(intent.idempotency_key)??null)===hash(receipt))};
 const getLiveAuthority=vi.fn(async()=>({state:structuredClone(state),checkpoint:head,policy}));
 const coordinator=new RootExecutionCoordinator({journal,getLiveAuthority,adapters:new Map([[proposal.action,adapter]]),clock:()=>now});
 return {coordinator,journal,adapter,db,apply,getLiveAuthority,target,request:confirmation,advance:ms=>{now+=ms;},freeze:async()=>{const r=await run(a=>engine.request({action:'GOVERNANCE_FREEZE',target:hash({freeze:true})},a));await run(a=>engine.approve(r.request_id,approve(r,'B'),a));}};
}
it('claims one root operation across simultaneous attempts and persists immutable receipt history',async()=>{
 const f=await fixture();const results=await Promise.all([f.coordinator.run(f.request.request_id,f.target),f.coordinator.run(f.request.request_id,f.target)]);
 expect(f.adapter.execute).toHaveBeenCalledTimes(1);expect(results.some(r=>r.status==='APPLIED')).toBe(true);
 const key=results[0].reservation.intent.idempotency_key;expect((await f.journal.read(key)).status).toBe('APPLIED');await f.coordinator.run(f.request.request_id,f.target);expect(f.adapter.execute).toHaveBeenCalledTimes(1);
 await expect(f.db.query('delete from founder_governance.execution_events')).rejects.toThrow(/append-only/);await expect(f.db.query('update founder_governance.execution_reservations set document=$1',[{}])).rejects.toThrow(/append-only/);
});
it('never repeats an ambiguous provider action and reconciles through verified observation after expiry',async()=>{
 const f=await fixture();f.adapter.execute.mockImplementationOnce(async({intent})=>{f.apply(intent);throw new Error('response lost with secret provider text');});
 const first=await f.coordinator.run(f.request.request_id,f.target),key=first.reservation.intent.idempotency_key;expect(first.status).toBe('OUTCOME_UNKNOWN');expect(JSON.stringify(first)).not.toContain('secret provider text');
 expect((await f.coordinator.run(f.request.request_id,f.target)).status).toBe('OUTCOME_UNKNOWN');expect(f.adapter.execute).toHaveBeenCalledTimes(1);
 f.advance(600000);await expect(f.coordinator.run(f.request.request_id,f.target)).rejects.toThrow();expect((await f.coordinator.reconcile(key)).status).toBe('APPLIED');expect(f.adapter.execute).toHaveBeenCalledTimes(1);expect(f.adapter.lookupReceipt).toHaveBeenCalledTimes(1);
});
it('blocks a freeze between reservation and dispatch without a provider call',async()=>{
 const f=await fixture(),get=f.getLiveAuthority.getMockImplementation();f.getLiveAuthority.mockImplementationOnce(get).mockImplementationOnce(async()=>{await f.freeze();return get();});
 const outcome=await f.coordinator.run(f.request.request_id,f.target);expect(outcome.status).toBe('NOT_DISPATCHED');expect(f.adapter.execute).not.toHaveBeenCalled();await f.coordinator.reconcile(outcome.reservation.intent.idempotency_key);expect(f.adapter.lookupReceipt).not.toHaveBeenCalled();
});
it('rejects fabricated/changed receipts and requires independently fenced adapters',async()=>{
 const f=await fixture();f.adapter.execute.mockImplementationOnce(async({intent})=>({...f.apply(intent),target_hash:'a'.repeat(64)}));const first=await f.coordinator.run(f.request.request_id,f.target);expect(first.status).toBe('OUTCOME_UNKNOWN');
 f.adapter.lookupReceipt.mockImplementationOnce(async({intent})=>({...f.apply(intent),operation_id:'fabricated-operation'}));expect((await f.coordinator.reconcile(first.reservation.intent.idempotency_key)).status).toBe('OUTCOME_UNKNOWN');
 f.adapter.enforcement='unchecked';await expect(f.coordinator.run(f.request.request_id,f.target)).rejects.toThrow(/fenced/);expect(f.adapter.execute).toHaveBeenCalledTimes(1);
});
it('treats a provider timeout as unknown, aborts its wait and does not retry',async()=>{
 const f=await fixture();let signal;f.adapter.execute.mockImplementationOnce(async options=>{signal=options.signal;return new Promise(()=>{});});
 const coordinator=new RootExecutionCoordinator({journal:f.journal,getLiveAuthority:f.getLiveAuthority,adapters:new Map([[f.request.action,f.adapter]]),callTimeoutMs:10});
 // Keep the synthetic authority clock aligned; no real provider operation.
 coordinator.clock=()=>Date.parse(f.request.created_at);
 const first=await coordinator.run(f.request.request_id,f.target);expect(first.status).toBe('OUTCOME_UNKNOWN');expect(signal.aborted).toBe(true);await coordinator.run(f.request.request_id,f.target);expect(f.adapter.execute).toHaveBeenCalledTimes(1);
});
