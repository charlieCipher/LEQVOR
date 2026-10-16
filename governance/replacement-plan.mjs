import {exact,hash,validatePolicy,verifyCommitment} from './protocol.mjs';
import {verifyExecutionAuthorization} from './execution-permit.mjs';
const digest=/^[a-f0-9]{64}$/;
export function replacementPossessionCommitment(request,credential,evidenceHash){return {domain:'leqvor-founder-device-possession-v1',request_hash:hash(request),policy_hash:request.policy_hash,key_id:credential.key_id,evidence_hash:evidenceHash};}
// Offline, non-mutating planner for ONE lost device. Not enrollment, recovery
// execution or a catastrophic-recovery override. Hardware evidence and device
// independence come from separately trusted verifier/registry adapters.
export async function planDeviceReplacement({authority,request_id,target,evidence,possession,getDeviceRegistry,verifyHardwareEvidence,clock=Date.now}){
 authority=structuredClone(authority);target=structuredClone(target);evidence=structuredClone(evidence);possession=structuredClone(possession);
 if(typeof getDeviceRegistry!=='function'||typeof verifyHardwareEvidence!=='function')throw new Error('Independent device registry and hardware verifier required.');
 exact(target,['domain','slot','prior_key_id','credential','evidence_hash','device_instance_hash']);
 if(target.domain!=='leqvor-founder-replacement-target-v1'||!digest.test(target.evidence_hash)||!digest.test(target.device_instance_hash)||hash(evidence)!==target.evidence_hash)throw new Error('Replacement evidence commitment differs.');
 const intent=verifyExecutionAuthorization({...authority,request_id,target,now:clock()});
 if(intent.action!=='REPLACE_FOUNDER_IDENTITY')throw new Error('Replacement root authorization required.');
 const old=authority.policy.credentials.find(c=>c.slot===target.slot);
 if(!old||old.key_id!==target.prior_key_id||target.credential.slot!==target.slot||authority.policy.credentials.some(c=>c.key_id===target.credential.key_id))throw new Error('Replacement identity differs or reuses an existing key.');
 const candidate={...authority.policy,credentials:authority.policy.credentials.map(c=>c.slot===target.slot?target.credential:c)};validatePolicy(candidate);
 const registry=await getDeviceRegistry();
 if(!Array.isArray(registry)||registry.length!==3)throw new Error('Three independently verified existing device bindings required.');
 for(const row of registry){
  exact(row,['slot','key_id','device_instance_hash']);
  if(!digest.test(row.device_instance_hash)||!authority.policy.credentials.some(c=>c.slot===row.slot&&c.key_id===row.key_id))throw new Error('Existing device binding differs from pinned policy.');
 }
 if(new Set(registry.map(r=>r.slot)).size!==3||new Set(registry.map(r=>r.device_instance_hash)).size!==3||registry.some(r=>r.device_instance_hash===target.device_instance_hash))throw new Error('Replacement must be a separate verified device.');
 const verified=await verifyHardwareEvidence({credential:structuredClone(target.credential),evidence:structuredClone(evidence),request:structuredClone(authority.state.requests[request_id].request)});
 exact(verified,['key_id','evidence_hash','device_instance_hash']);
 if(verified.key_id!==target.credential.key_id||verified.evidence_hash!==target.evidence_hash||verified.device_instance_hash!==target.device_instance_hash)throw new Error('Hardware evidence or physical device binding unverified.');
 const request=authority.state.requests[request_id].request;
 if(!verifyCommitment(replacementPossessionCommitment(request,target.credential,target.evidence_hash),possession,candidate)||possession.key_id!==target.credential.key_id||possession.slot!==target.slot)throw new Error('Fresh replacement-key possession signature required.');
 // Evidence verification may be slow. Recheck expiry before emitting a plan;
 // the real executor must still check LIVE state and enforce the final fence.
 verifyExecutionAuthorization({...authority,request_id,target,now:clock()});
 return {domain:'leqvor-founder-replacement-plan-v1',request_id,source_policy_hash:hash(authority.policy),candidate_policy_hash:hash(candidate),candidate_policy:candidate,revoked_key_id:old.key_id,new_key_id:target.credential.key_id,evidence_hash:target.evidence_hash,device_instance_hash:target.device_instance_hash,status:'REVIEW_REQUIRED'};
}
