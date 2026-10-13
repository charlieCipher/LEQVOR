// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {initialGovernance,checkpoint,GovernanceEngine} from '../governance/engine.mjs';
import {hash,encode,approvalCommitment} from '../governance/protocol.mjs';
import {planDeviceReplacement,replacementPossessionCommitment} from '../governance/replacement-plan.mjs';
async function fixture(){
 const keys=['A','B','C','A'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.slice(0,3).map(k=>k.pin)};let state=initialGovernance(policy),head=checkpoint(state),now=Date.parse('2026-10-13T12:00:00Z');
 const engine=new GovernanceEngine({transaction:async op=>{const next=structuredClone(state),result=await op(next);state=next;return result;}},{clock:()=>now,policyPin:async()=>hash(policy)});
 const run=async op=>{const reply=await op(head);head=reply.checkpoint;return reply.result;};
 const signWith=(key,body)=>({slot:key.pin.slot,key_id:key.pin.key_id,signature:sign('sha256',encode(body),{key:key.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')});
 const evidence={domain:'synthetic-public-test-evidence',challenge:hash({nonce:'test'})},target={domain:'leqvor-founder-replacement-target-v1',slot:'A',prior_key_id:keys[0].pin.key_id,credential:keys[3].pin,evidence_hash:hash(evidence),device_instance_hash:hash({physical_fixture:4})};
 const proposal=await run(a=>engine.request({action:'REPLACE_FOUNDER_IDENTITY',target:hash(target)},a));
 for(const k of keys.slice(1,3))await run(a=>engine.approve(proposal.request_id,signWith(k,approvalCommitment(proposal,k.pin.key_id)),a));now+=259200000;
 const confirm=await run(a=>engine.request({action:proposal.action,target:proposal.target,proposal_id:proposal.request_id},a));for(const k of keys.slice(1,3))await run(a=>engine.approve(confirm.request_id,signWith(k,approvalCommitment(confirm,k.pin.key_id)),a));
 const registry=keys.slice(0,3).map((k,i)=>({slot:k.pin.slot,key_id:k.pin.key_id,device_instance_hash:hash({physical_fixture:i+1})}));
 const input={authority:{state,checkpoint:head,policy},request_id:confirm.request_id,target,evidence,possession:signWith(keys[3],replacementPossessionCommitment(confirm,keys[3].pin,target.evidence_hash)),getDeviceRegistry:vi.fn(async()=>registry),verifyHardwareEvidence:vi.fn(async()=>({key_id:target.credential.key_id,evidence_hash:target.evidence_hash,device_instance_hash:target.device_instance_hash})),clock:()=>now};
 return {input,registry,state,policy,advance:ms=>{now+=ms;}};
}
it('plans one lost-device replacement using the other two root keys without activating it',async()=>{
 const f=await fixture(),before=hash(f.state),plan=await planDeviceReplacement(f.input);expect(plan.status).toBe('REVIEW_REQUIRED');expect(plan.candidate_policy.threshold).toBe(2);expect(plan.candidate_policy.credentials).toHaveLength(3);expect(plan.revoked_key_id).toBe(f.policy.credentials[0].key_id);expect(plan.candidate_policy.credentials[0]).toEqual(f.input.target.credential);expect(hash(f.state)).toBe(before);expect(f.state.policy).toEqual(f.policy);
});
it('rejects unverified hardware, reused physical devices, wrong possession and tampered evidence',async()=>{
 const f=await fixture();await expect(planDeviceReplacement({...f.input,verifyHardwareEvidence:async()=>({key_id:f.input.target.credential.key_id,evidence_hash:'a'.repeat(64),device_instance_hash:f.input.target.device_instance_hash})})).rejects.toThrow(/unverified/);
 const reused=f.registry.map(r=>({...r}));reused[1].device_instance_hash=f.input.target.device_instance_hash;await expect(planDeviceReplacement({...f.input,getDeviceRegistry:async()=>reused})).rejects.toThrow(/separate/);
 await expect(planDeviceReplacement({...f.input,possession:{...f.input.possession,signature:'invalid'}})).rejects.toThrow(/possession/);
 await expect(planDeviceReplacement({...f.input,evidence:{altered:true}})).rejects.toThrow(/commitment/);
});
it('provides no single-key/admin recovery path and refuses expiry during evidence verification',async()=>{
 const f=await fixture();await expect(planDeviceReplacement({...f.input,getDeviceRegistry:undefined})).rejects.toThrow(/registry/);
 const invalid=structuredClone(f.input.authority);invalid.state.requests[f.input.request_id].approvals.pop();await expect(planDeviceReplacement({...f.input,authority:invalid})).rejects.toThrow();
 await expect(planDeviceReplacement({...f.input,verifyHardwareEvidence:async args=>{f.advance(600000);return {key_id:args.credential.key_id,evidence_hash:hash(args.evidence),device_instance_hash:f.input.target.device_instance_hash};}})).rejects.toThrow(/expired/);
});
