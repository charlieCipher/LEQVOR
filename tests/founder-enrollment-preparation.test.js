// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
import {createEnrollmentPreparation,validateEnrollmentPreparation,recordEnrollmentEvidence,assessEnrollmentPreparation,READINESS_CHECKS} from '../governance/enrollment-preparation.mjs';
import {hash,encode,approvalCommitment,validatePolicy} from '../governance/protocol.mjs';
import {initialGovernance,GovernanceEngine,checkpoint} from '../governance/engine.mjs';
const now=Date.parse('2026-10-16T12:00:00.000Z'),roots=[],parent=resolve(tmpdir());
afterEach(async()=>{for(const root of roots.splice(0)){if(!root.startsWith(parent+sep)||!root.includes('leqvor-enrollment-test-'))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});}});
function fixture(){
 const keys=['A','B','C'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=pair.publicKey.export({type:'spki',format:'der'});return {pair,credential:{slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')}};});
 const evidence=keys.map(k=>({domain:'leqvor-founder-device-evidence-v1',credential:k.credential,certificate_chain:['AAAA','AAAA','AAAA'],attestation_challenge:'A'.repeat(43)+'=',independently_verified:false}));
 const prepared=evidence.reduce(recordEnrollmentEvidence,createEnrollmentPreparation()),policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.credential)};
 const receipt={domain:'leqvor-founder-enrollment-readiness-v1',preparation_hash:hash(prepared),policy_hash:hash(policy),verified_at:new Date(now).toISOString(),expires_at:new Date(now+300000).toISOString(),device_bindings:keys.map((k,i)=>({slot:k.credential.slot,key_id:k.credential.key_id,evidence_hash:hash(evidence[i]),device_instance_hash:hash({synthetic_device:i})})),checks:Object.fromEntries(READINESS_CHECKS.map(c=>[c,true])),verifier_report_hash:hash({synthetic_report:true})};
 const adapters={verifyReadiness:vi.fn(async()=>receipt),getIndependentPolicyPin:vi.fn(async()=>hash(policy)),clock:()=>now};return {keys,evidence,prepared,policy,receipt,adapters};
}
it('records A/B with a genuinely empty C slot and never creates a two-key root policy',async()=>{
 const f=fixture(),empty=createEnrollmentPreparation(),a=recordEnrollmentEvidence(empty,f.evidence[0]),ab=recordEnrollmentEvidence(a,f.evidence[1]);
 expect(ab.slots.C).toEqual({status:'NOT_PROVISIONED',credential:null,evidence_hash:null});expect(ab.previous_preparation_hash).toBe(hash(a));expect(ab.root_authority_active).toBe(false);expect(empty.slots.A.credential).toBeNull();
 expect(await assessEnrollmentPreparation(ab,f.adapters)).toMatchObject({status:'PREPARED',policy_candidate:null,activation_allowed:false,blockers:['C_NOT_PROVISIONED','INDEPENDENT_ACCEPTANCE_REQUIRED']});expect(f.adapters.verifyReadiness).not.toHaveBeenCalled();
 expect(()=>validatePolicy(ab)).toThrow();expect(()=>initialGovernance(ab)).toThrow();expect(()=>validatePolicy({...f.policy,credentials:f.policy.credentials.slice(0,2)})).toThrow();
});
it('rejects fake pending credentials, weaker policy knobs, active flags and acceptance claims',()=>{
 const f=fixture(),base=createEnrollmentPreparation();
 for(const change of [{intended_threshold:1},{intended_cooling_ms:0},{root_authority_active:true},{status:'ACTIVE'},{status:'ENROLLMENT_READY'},{slots:{...base.slots,C:{status:'NOT_PROVISIONED',credential:f.keys[2].credential,evidence_hash:hash(f.evidence[2])}}}])expect(()=>validateEnrollmentPreparation({...base,...change})).toThrow();
 expect(()=>recordEnrollmentEvidence(base,{...f.evidence[0],independently_verified:true})).toThrow();expect(()=>recordEnrollmentEvidence(base,{...f.evidence[0],private_key:'SYNTHETIC_ONLY'})).toThrow();
});
it('does not reset existing keys or disguise the same key as another device slot',()=>{
 const f=fixture(),a=recordEnrollmentEvidence(createEnrollmentPreparation(),f.evidence[0]);expect(recordEnrollmentEvidence(a,f.evidence[0])).toEqual(a);
 const other=fixture();expect(()=>recordEnrollmentEvidence(a,other.evidence[0])).toThrow(/replaced/);
 expect(()=>recordEnrollmentEvidence(a,{...f.evidence[0],credential:{...f.evidence[0].credential,slot:'C'}})).toThrow(/Duplicate/);
});
it('requires all independent acceptance gates and three distinct physical bindings, without activating',async()=>{
 const f=fixture();expect(await assessEnrollmentPreparation(f.prepared)).toMatchObject({status:'PREPARED',policy_candidate:null});
 const ready=await assessEnrollmentPreparation(f.prepared,f.adapters);expect(ready).toMatchObject({status:'ENROLLMENT_READY',policy_candidate:f.policy,root_authority_active:false,activation_allowed:false});expect(f.prepared.status).toBe('PREPARED');
 for(const check of READINESS_CHECKS){const receipt=structuredClone(f.receipt);receipt.checks[check]=false;await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,verifyReadiness:async()=>receipt})).rejects.toThrow(/incomplete/);}
 const receipt=structuredClone(f.receipt);receipt.device_bindings[2].device_instance_hash=receipt.device_bindings[0].device_instance_hash;await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,verifyReadiness:async()=>receipt})).rejects.toThrow(/separate/);
});
it('denies stale/substituted receipts, wrong pins, reused bindings and expiry during slow verification',async()=>{
 const f=fixture();for(const change of [{preparation_hash:'0'.repeat(64)},{policy_hash:'0'.repeat(64)},{expires_at:new Date(now).toISOString()},{device_bindings:[f.receipt.device_bindings[0],f.receipt.device_bindings[0],f.receipt.device_bindings[2]]}])await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,verifyReadiness:async()=>({...f.receipt,...change})})).rejects.toThrow();
 await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,getIndependentPolicyPin:async()=> '0'.repeat(64)})).rejects.toThrow();
 let time=now;await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,clock:()=>time,getIndependentPolicyPin:async()=>{time=now+300000;return hash(f.policy);}})).rejects.toThrow();
 await expect(assessEnrollmentPreparation(f.prepared,{...f.adapters,verifyReadiness:async()=>{throw Error('Unavailable');}})).rejects.toThrow();
});
it('uses the unchanged engine for A+B, A+C and B+C only after a complete synthetic policy exists',async()=>{
 const f=fixture();for(const pair of [[0,1],[0,2],[1,2]]){
  let state=initialGovernance(f.policy),head=checkpoint(state),time=now;
  const engine=new GovernanceEngine({transaction:async operation=>{const next=structuredClone(state),out=await operation(next);state=next;return out;}},{clock:()=>time,policyPin:async()=>hash(f.policy)});
  const run=async operation=>{const reply=await operation(head);head=reply.checkpoint;return reply.result;};
  const approve=async request=>{for(const i of pair){const k=f.keys[i],approval={slot:k.credential.slot,key_id:k.credential.key_id,signature:sign('sha256',encode(approvalCommitment(request,k.credential.key_id)),{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};await run(h=>engine.approve(request.request_id,approval,h));}};
  const request=await run(h=>engine.request({action:'CHANGE_ROOT_POLICY',target:hash({synthetic:true})},h));await approve(request);expect(state.requests[request.request_id].status).toBe('COOLING');
  await expect(engine.request({action:request.action,target:request.target,proposal_id:request.request_id},head)).rejects.toThrow();time+=259200000;
  const confirm=await run(h=>engine.request({action:request.action,target:request.target,proposal_id:request.request_id},h));await approve(confirm);expect(state.requests[confirm.request_id].status).toBe('AUTHORIZED');
 }
});
it('exposes only explicit public-file preparation/inspection and refuses output overwrite',async()=>{
 const root=await mkdtemp(join(parent,'leqvor-enrollment-test-'));roots.push(root);const file=join(root,'preparation.json'),run=promisify(execFile);
 await run(process.execPath,['governance/enrollment-preparation-cli.mjs','create',file]);const stored=JSON.parse(await readFile(file,'utf8'));expect(stored.slots.C.credential).toBeNull();
 const inspected=await run(process.execPath,['governance/enrollment-preparation-cli.mjs','inspect',file]);expect(JSON.parse(inspected.stdout)).toMatchObject({status:'PREPARED',activation_allowed:false,root_authority_active:false});
 await expect(run(process.execPath,['governance/enrollment-preparation-cli.mjs','create',file])).rejects.toThrow();await expect(run(process.execPath,['governance/enrollment-preparation-cli.mjs','activate',file])).rejects.toThrow();expect(JSON.parse(await readFile(file,'utf8'))).toEqual(stored);
});
