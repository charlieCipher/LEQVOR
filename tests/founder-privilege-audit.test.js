// @vitest-environment node
// Characterization tests for the 2026-10-16 review. These expose current limits;
// passing them is evidence of the findings, not evidence that the gaps are fixed.
import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PostgresGovernanceStore} from '../governance/postgres-store.mjs';
import {GovernanceEngine,initialGovernance,checkpoint} from '../governance/engine.mjs';
import {hash,encode,approvalCommitment} from '../governance/protocol.mjs';
import {verifySnapshot} from '../governance/audit.mjs';
import {verifyGovernanceDatabase} from '../governance/control/neon-database.mjs';

const scripts=await Promise.all(['001_founder_state.sql','002_execution_journal.sql','003_control_permissions.sql'].map(n=>readFile(new URL(`../governance/migrations/${n}`,import.meta.url),'utf8')));
async function database(){
 const seed=new PGlite();await seed.exec('create database neondb');const bytes=await seed.dumpDataDir();await seed.close();
 const db=new PGlite({loadDataDir:bytes,database:'neondb'});for(const sql of scripts)await db.exec(sql);return db;
}
function policyFixture(){
 // Disposable in-memory identities only, never production founder credentials.
 const keys=['A','B','C'].map(slot=>{
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});
  return {pair,pin:{slot,algorithm:'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')}};
 });
 return {keys,policy:{domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)}};
}
it('documents that schema-only default revocation leaves future functions PUBLIC executable; global owner defaults close that gap',async()=>{
 const db=await database();try{
  await db.exec("create function founder_governance.audit_fixture_before() returns int language sql as 'select 1'");
  expect((await db.query("select has_function_privilege('leqvor_governance_control','founder_governance.audit_fixture_before()','EXECUTE') as allowed")).rows[0].allowed).toBe(true);
  await db.exec("create function founder_governance.audit_fixture_definer() returns int language sql security definer set search_path=pg_catalog as 'select 1'");
  await db.exec('set role leqvor_governance_control');
  // The startup matrix currently does not inventory callable definer functions.
  await expect(verifyGovernanceDatabase({connect:async()=>({query:(sql,values)=>db.query(sql,values),release:()=>{}})})).resolves.toBeUndefined();
  await db.exec('reset role');
  // Proposed corrective action tested only inside this disposable local database.
  await db.exec('alter default privileges revoke execute on functions from public');
  await db.exec("create function founder_governance.audit_fixture_after() returns int language sql as 'select 1'");
  expect((await db.query("select has_function_privilege('leqvor_governance_control','founder_governance.audit_fixture_after()','EXECUTE') as allowed")).rows[0].allowed).toBe(false);
 }finally{await db.close();}
},30000);
it('documents direct control JSON writes and owner trigger bypass; SQL is not a cryptographic authorization boundary',async()=>{
 const db=await database();try{
  await db.query('insert into founder_governance.root_state(document) values($1)',[{audit:[],fixture:'before'}]);
  await db.exec('set role leqvor_governance_control');
  await db.exec("update founder_governance.root_state set document='{}'");
  await db.exec('reset role');
  expect((await db.query('select document from founder_governance.root_state')).rows[0].document).toEqual({});
  await db.query('insert into founder_governance.audit_events values(1,$1,$2)',['a'.repeat(64),{fixture:true}]);
  await expect(db.exec('delete from founder_governance.audit_events')).rejects.toThrow(/append-only/);
  await db.exec('alter table founder_governance.audit_events disable trigger founder_audit_append_only');
  await db.exec('delete from founder_governance.audit_events');
  expect((await db.query('select count(*)::int as n from founder_governance.audit_events')).rows[0].n).toBe(0);
 }finally{await db.close();}
},30000);
it('documents that a forged caller checkpoint passes after state tampering, while an independently retained checkpoint detects it',async()=>{
 const {policy,keys}=policyFixture(),state=initialGovernance(policy);
 const engine=new GovernanceEngine({transaction:async op=>op(state)},{policyPin:async()=>hash(policy)});
 const created=await engine.request({action:'GOVERNANCE_FREEZE',target:'a'.repeat(64)},checkpoint(state)),key=keys[0];
 await engine.approve(created.result.request_id,{slot:'A',key_id:key.pin.key_id,signature:sign('sha256',encode(approvalCommitment(created.result,key.pin.key_id)),{key:key.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')},created.checkpoint);
 expect(state.frozen).toBe(true);
 const retained=checkpoint(state);state.frozen=false;
 await expect(engine.snapshot(retained)).rejects.toThrow(/checkpoint mismatch/);
 // Same pinned policy and valid hash chain, including the real freeze event;
 // the supplied head is not signed
 // or fetched independently by the current server-side engine.
 expect((await engine.snapshot(checkpoint(state))).result.frozen).toBe(false);
 expect(()=>verifySnapshot(state,retained,policy)).toThrow();
});
it('documents that duplicated SQL hash/sequence columns are not validated by the current store read path',async()=>{
 const db=await database();try{
  const event={fixture:true};
  await db.query('insert into founder_governance.root_state(document) values($1)',[{audit:[event]}]);
  await db.query('insert into founder_governance.audit_events values(7,$1,$2)',['b'.repeat(64),event]);
  const store=new PostgresGovernanceStore({transaction:async operation=>{
   await db.exec('begin; set local role leqvor_governance_control');
   try{const result=await operation({query:(sql,values)=>db.query(sql,values)});await db.exec('commit');return result;}
   catch(error){await db.exec('rollback');throw error;}
  }});
  // Engine verification is a separate layer; this assertion isolates storage.
  await expect(store.transaction(()=>true)).resolves.toBe(true);
 }finally{await db.close();}
},30000);
