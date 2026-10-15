import {exact,hash,encode,validatePolicy,verifyCommitment} from './protocol.mjs';
import {verifyExecutionHistory} from './execution-journal.mjs';
const hex=/^[a-f0-9]{64}$/;
export function executionCheckpoint(snapshot,policy){
 validatePolicy(policy);exact(snapshot,['reservation','events','status','receipt']);
 const verified=verifyExecutionHistory(snapshot.reservation,snapshot.events),intent=verified.reservation.intent;
 exact(intent,['domain','request_id','action','target_hash','policy_hash','governance_version','expires_at','idempotency_key']);
 if(intent.domain!=='leqvor-root-execution-intent-v1'||intent.policy_hash!==hash(policy)||snapshot.status!==verified.status||hash(snapshot.receipt)!==hash(verified.receipt))throw Error('Execution snapshot differs from pinned policy/history');
 return {domain:'leqvor-execution-checkpoint-v1',platform:'leqvor.vercel.app',policy_hash:hash(policy),execution_key:intent.idempotency_key,reservation_hash:hash(snapshot.reservation),sequence:verified.events.length,event_hash:verified.events.at(-1).event_hash,status:verified.status};
}
export function validateExecutionCheckpoint(value,policy){
 validatePolicy(policy);exact(value,['domain','platform','policy_hash','execution_key','reservation_hash','sequence','event_hash','status']);
 if(value.domain!=='leqvor-execution-checkpoint-v1'||value.platform!=='leqvor.vercel.app'||value.policy_hash!==hash(policy)||![value.execution_key,value.reservation_hash,value.event_hash].every(v=>hex.test(v))||!Number.isSafeInteger(value.sequence)||value.sequence<1||value.sequence>100||!['ATTEMPTED','OUTCOME_UNKNOWN','NOT_DISPATCHED','APPLIED','NOT_APPLIED'].includes(value.status))throw Error('Invalid execution checkpoint');return value;
}
export function executionCheckpointCommitment(checkpoint,keyId){return {domain:'leqvor-execution-checkpoint-approval-v1',platform:'leqvor.vercel.app',checkpoint,signer_key_id:keyId};}
export function verifyExecutionCheckpointPacket(packet,policy){
 try{exact(packet,['checkpoint','approvals']);validateExecutionCheckpoint(packet.checkpoint,policy);
  return Array.isArray(packet.approvals)&&packet.approvals.length>=2&&packet.approvals.length<=3&&new Set(packet.approvals.map(a=>a.slot)).size===packet.approvals.length&&new Set(packet.approvals.map(a=>a.key_id)).size===packet.approvals.length&&packet.approvals.every(a=>verifyCommitment(executionCheckpointCommitment(packet.checkpoint,a.key_id),a,policy));
 }catch{return false;}
}
function validateAnchor(anchor,policy){exact(anchor,['execution_key','archive_hash','checkpoint']);if(!hex.test(anchor.execution_key)||(anchor.archive_hash===null)!==(anchor.checkpoint===null))throw Error('Independent execution anchor required');if(anchor.checkpoint!==null){if(!hex.test(anchor.archive_hash))throw Error('Invalid predecessor');validateExecutionCheckpoint(anchor.checkpoint,policy);if(anchor.checkpoint.execution_key!==anchor.execution_key)throw Error('Anchor execution differs');}}
export function createExecutionArchive({policy,snapshot,checkpoint_packet,anchor}){
 policy=structuredClone(policy);snapshot=structuredClone(snapshot);checkpoint_packet=structuredClone(checkpoint_packet);anchor=structuredClone(anchor);
 validateAnchor(anchor,policy);const head=executionCheckpoint(snapshot,policy);
 if(!verifyExecutionCheckpointPacket(checkpoint_packet,policy)||hash(head)!==hash(checkpoint_packet.checkpoint)||head.execution_key!==anchor.execution_key)throw Error('Two-founder execution checkpoint and matching history required');
 const prior=anchor.checkpoint;
 if(prior&&(head.sequence<=prior.sequence||head.reservation_hash!==prior.reservation_hash||snapshot.events[prior.sequence-1]?.event_hash!==prior.event_hash||['APPLIED','NOT_APPLIED','NOT_DISPATCHED'].includes(prior.status)))throw Error('Execution rollback, fork or terminal extension rejected');
 return {domain:'leqvor-execution-archive-v1',policy_hash:hash(policy),previous_archive_hash:anchor.archive_hash,checkpoint_packet,snapshot};
}
export function restoreExecutionArchive(archive,{policy,anchor,expectedHash}){
 exact(archive,['domain','policy_hash','previous_archive_hash','checkpoint_packet','snapshot']);
 if(!hex.test(expectedHash)||hash(archive)!==expectedHash||archive.domain!=='leqvor-execution-archive-v1'||archive.policy_hash!==hash(policy)||archive.previous_archive_hash!==anchor.archive_hash)throw Error('Execution archive digest/policy/predecessor differs');
 const verified=createExecutionArchive({policy,snapshot:archive.snapshot,checkpoint_packet:archive.checkpoint_packet,anchor});
 // Signed journal evidence is not authoritative provider proof or an execute
 // permit. Recovery must independently reconcile any actual remote operation.
 return {snapshot:verified.snapshot,checkpoint:verified.checkpoint_packet.checkpoint,archive_hash:expectedHash,provider_receipt_verified:false,execution_allowed:false};
}
export async function retainExecutionArchive({store,...input}){
 if(typeof store?.putIfAbsent!=='function'||typeof store?.get!=='function')throw Error('Explicit immutable archive adapter required');
 const archive=createExecutionArchive(input),digest=hash(archive),bytes=encode(archive);if(bytes.length>4194304)throw Error('Execution archive capacity exceeded');
 await store.putIfAbsent(digest,bytes);const retained=await store.get(digest);if(!(retained instanceof Uint8Array)||retained.length>4194304)throw Error('Invalid archive read-back');
 const restored=restoreExecutionArchive(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(retained)),{policy:input.policy,anchor:input.anchor,expectedHash:digest});
 return {execution_key:restored.checkpoint.execution_key,archive_hash:digest,checkpoint:restored.checkpoint};
}
