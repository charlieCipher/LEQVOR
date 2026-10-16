// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {GovernanceEngine,initialGovernance,checkpoint,verifyAudit} from '../governance/engine.mjs';
import {PostgresGovernanceStore} from '../governance/postgres-store.mjs';
import {hash,encode,approvalCommitment,validatePolicy} from '../governance/protocol.mjs';
import {verifyExecutionAuthorization} from '../governance/execution-permit.mjs';
const databases=[];afterEach(async()=>{for(const db of databases.splice(0))await db.close();});
async function fixture(){
 const keys=['A','B','C'].map((slot,i)=>{const pair=i===0?generateKeyPairSync('rsa',{modulusLength:2048}):generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:i===0?'RS256':'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:72*60*60*1000,credentials:keys.map(k=>k.pin)},state=initialGovernance(policy);
 const db=new PGlite();databases.push(db);await db.exec(await readFile('governance/migrations/001_founder_state.sql','utf8'));await db.query('insert into founder_governance.root_state(document) values($1)',[state]);
 let now=Date.parse('2026-10-12T12:00:00.000Z'),anchor=checkpoint(state);
 const engine=new GovernanceEngine(new PostgresGovernanceStore(db),{clock:()=>now,policyPin:async()=>hash(policy)});
 const approve=(request,slot)=>{const k=keys.find(k=>k.pin.slot===slot);return {slot,key_id:k.pin.key_id,signature:sign('sha256',encode(approvalCommitment(request,k.pin.key_id)),{key:k.pair.privateKey,...(k.pin.algorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{})}).toString('base64')};};
 const run=async operation=>{const r=await operation(anchor);anchor=r.checkpoint;return r.result;};
 const read=async()=>(await db.query('select document from founder_governance.root_state')).rows[0].document;
 return {engine,db,policy,keys,approve,run,read,get anchor(){return anchor;},get now(){return now;},advance:ms=>{now+=ms;}};
}
const target=hash({account_id:'exact-target-account'});
it('requires two independent approvals, 72 hours and two fresh confirmations against actual PostgreSQL state',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'TRANSFER_PLATFORM_OWNERSHIP',target},a));
 expect((await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'A'),a))).status).toBe('PENDING');
 await expect(f.engine.approve(request.request_id,f.approve(request,'A'),f.anchor)).rejects.toThrow();
 expect((await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'B'),a))).status).toBe('COOLING');
 await expect(f.engine.request({action:request.action,target,proposal_id:request.request_id},f.anchor)).rejects.toThrow();
 f.advance(72*60*60*1000);const confirm=await f.run(a=>f.engine.request({action:request.action,target,proposal_id:request.request_id},a));
 await expect(f.engine.approve(confirm.request_id,f.approve(request,'A'),f.anchor)).rejects.toThrow();
 expect((await f.run(a=>f.engine.approve(confirm.request_id,f.approve(confirm,'B'),a))).status).toBe('PENDING');
 expect((await f.run(a=>f.engine.approve(confirm.request_id,f.approve(confirm,'C'),a))).status).toBe('AUTHORIZED');
 await expect(f.engine.approve(confirm.request_id,f.approve(confirm,'A'),f.anchor)).rejects.toThrow();
 const state=await f.read();expect(state.version).toBe(2);expect(verifyAudit(state.audit,f.anchor)).toBe(true);expect(state.requests[request.request_id].status).toBe('CONSUMED');
 expect((await f.db.query('select count(*)::int as n from founder_governance.audit_events')).rows[0].n).toBe(state.audit.length);
});
it('independently verifies a live execution intent and denies stale, different-target and frozen operations',async()=>{
 const f=await fixture(),artifact={account_id:'exact-target-account'},request=await f.run(a=>f.engine.request({action:'TRANSFER_PLATFORM_OWNERSHIP',target:hash(artifact)},a));
 await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'A'),a));await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'B'),a));
 f.advance(259200000);const confirm=await f.run(a=>f.engine.request({action:request.action,target:request.target,proposal_id:request.request_id},a));
 await f.run(a=>f.engine.approve(confirm.request_id,f.approve(confirm,'A'),a));await f.run(a=>f.engine.approve(confirm.request_id,f.approve(confirm,'C'),a));
 const state=await f.read(),input={state,checkpoint:f.anchor,policy:f.policy,request_id:confirm.request_id,target:artifact,now:f.now};
 const intent=verifyExecutionAuthorization(input);expect(intent.action).toBe(request.action);expect(intent.idempotency_key).toMatch(/^[a-f0-9]{64}$/);expect(verifyExecutionAuthorization(input)).toEqual(intent);
 expect(()=>verifyExecutionAuthorization({...input,target:{account_id:'different-account'}})).toThrow();
 expect(()=>verifyExecutionAuthorization({...input,now:f.now+600000})).toThrow();
 const freeze=await f.run(a=>f.engine.request({action:'GOVERNANCE_FREEZE',target},a));await f.run(a=>f.engine.approve(freeze.request_id,f.approve(freeze,'B'),a));
 expect(()=>verifyExecutionAuthorization({...input,state:state,checkpoint:f.anchor})).toThrow();
 expect(()=>verifyExecutionAuthorization({...input,state:undefined})).toThrow();
 expect(()=>verifyExecutionAuthorization({...input,state:{...state,frozen:true}})).toThrow();
 const frozenState=await f.read();expect(()=>verifyExecutionAuthorization({...input,state:frozenState,checkpoint:f.anchor})).toThrow(/freeze/);
});
it('freezes immediately with one credential, invalidates earlier requests and requires stronger unfreeze',async()=>{
 const f=await fixture(),old=await f.run(a=>f.engine.request({action:'DISABLE_FOUNDER_PROTECTION',target},a)),freeze=await f.run(a=>f.engine.request({action:'GOVERNANCE_FREEZE',target},a));
 await f.run(a=>f.engine.approve(freeze.request_id,f.approve(freeze,'C'),a));expect((await f.read()).frozen).toBe(true);
 await expect(f.engine.approve(old.request_id,f.approve(old,'A'),f.anchor)).rejects.toThrow();
 await expect(f.engine.request({action:'TRANSFER_PLATFORM_OWNERSHIP',target},f.anchor)).rejects.toThrow();
 const request=await f.run(a=>f.engine.request({action:'GOVERNANCE_UNFREEZE',target},a));
 await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'A'),a));await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'B'),a));expect((await f.read()).frozen).toBe(true);
});
it('rejects altered targets, wrong keys, expired challenges and stale independent checkpoints without writes',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'CHANGE_ROOT_POLICY',target},a)),before=await f.read();
 const changed={...request,target:hash({account_id:'wrong'})};await expect(f.engine.approve(request.request_id,f.approve(changed,'A'),f.anchor)).rejects.toThrow();
 const foreign=f.approve(request,'A');foreign.slot='B';await expect(f.engine.approve(request.request_id,foreign,f.anchor)).rejects.toThrow();
 await expect(f.engine.approve(request.request_id,f.approve(request,'A'),{...f.anchor,event_hash:'a'.repeat(64)})).rejects.toThrow();
 f.advance(600000);await expect(f.engine.approve(request.request_id,f.approve(request,'A'),f.anchor)).rejects.toThrow();expect(await f.read()).toEqual(before);
});
it('has one winner for concurrent approval writes and rolls back audit/state together',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'CHANGE_ROOT_THRESHOLD',target},a));
 const results=await Promise.allSettled(['A','B'].map(slot=>f.engine.approve(request.request_id,f.approve(request,slot),f.anchor)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await f.read()).requests[request.request_id].approvals).toHaveLength(1);
 await expect(f.db.query('delete from founder_governance.audit_events')).rejects.toThrow();
 const store=new PostgresGovernanceStore(f.db),before=await f.read();await expect(store.transaction(async state=>{state.frozen=true;throw Error('rollback');})).rejects.toThrow();expect(await f.read()).toEqual(before);
 await expect(store.transaction(async state=>{state.frozen=true;state.audit.push({...state.audit[0]});})).rejects.toThrow();expect(await f.read()).toEqual(before);
});
it('allows a separately signed protective cancellation and blocks cancelled proposal confirmation',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'REMOVE_FOUNDER_ROOT',target},a));
 await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'A'),a));await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'B'),a));
 const cancel=await f.run(a=>f.engine.request({action:'CANCEL_GOVERNANCE_REQUEST',target:hash(request)},a));await f.run(a=>f.engine.approve(cancel.request_id,f.approve(cancel,'C'),a));
 f.advance(72*60*60*1000);await expect(f.engine.request({action:request.action,target,proposal_id:request.request_id},f.anchor)).rejects.toThrow();
});
it('rejects duplicate policy keys, unsafe thresholds and altered audit history',async()=>{
 const f=await fixture();expect(()=>validatePolicy({...f.policy,threshold:1})).toThrow();expect(()=>validatePolicy({...f.policy,credentials:[f.policy.credentials[0],f.policy.credentials[0],f.policy.credentials[2]]})).toThrow();
 await f.run(a=>f.engine.request({action:'GOVERNANCE_FREEZE',target},a));const state=await f.read();state.audit[0].details.request.target='a'.repeat(64);expect(verifyAudit(state.audit,f.anchor)).toBe(false);expect(verifyAudit([],f.anchor)).toBe(false);
});
it('denies policy substitution and fabricated stored quorum even with matching database head',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'REMOVE_FOUNDER_ROOT',target},a));
 const state=await f.read();state.requests[request.request_id].approvals=[{slot:'B',key_id:f.keys[1].pin.key_id,signature:'A'.repeat(86)+'=='}];
 await f.db.query('update founder_governance.root_state set document=$1',[state]);await expect(f.engine.approve(request.request_id,f.approve(request,'A'),checkpoint(state))).rejects.toThrow(/Stored founder approvals/);
 const policy=structuredClone(f.policy);policy.credentials[0]=f.keys[2].pin;policy.credentials[0]={...policy.credentials[0],slot:'A'};policy.credentials[2]=f.keys[0].pin;policy.credentials[2]={...policy.credentials[2],slot:'C'};state.policy=policy;
 await f.db.query('update founder_governance.root_state set document=$1',[state]);await expect(f.engine.request({action:'GOVERNANCE_FREEZE',target},checkpoint(state))).rejects.toThrow(/Independent root policy pin/);
 expect(()=>new GovernanceEngine(new PostgresGovernanceStore(f.db))).toThrow();
});
it('detects database-only changes to cooling, freeze and request status against the retained state checkpoint',async()=>{
 const f=await fixture(),request=await f.run(a=>f.engine.request({action:'REMOVE_FOUNDER_ROOT',target},a));
 await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'A'),a));
 f.advance(60000);await f.run(a=>f.engine.approve(request.request_id,f.approve(request,'B'),a));
 const original=await f.read();
 for(const alter of [s=>{s.requests[request.request_id].cooling_until-=60000;},s=>{s.frozen=true;},s=>{s.requests[request.request_id].status='AUTHORIZED';}]){
  const changed=structuredClone(original);alter(changed);
  await f.db.query('update founder_governance.root_state set document=$1',[changed]);
  await expect(f.engine.snapshot(f.anchor)).rejects.toThrow(/Independent governance checkpoint/);
  expect((await f.db.query('select count(*)::int as n from founder_governance.audit_events')).rows[0].n).toBe(original.audit.length);
 }
 await f.db.query('update founder_governance.root_state set document=$1',[original]);
 await expect(f.engine.snapshot(f.anchor)).resolves.toHaveProperty('result.frozen',false);
});
