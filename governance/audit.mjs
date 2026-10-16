import {exact,hash,validatePolicy,verifyCommitment} from './protocol.mjs';
import {checkpoint,verifyAudit} from './engine.mjs';

export function validateCheckpoint(value,policy){
 exact(value,['policy_hash','state_hash','version','sequence','event_hash']);
 if(value.policy_hash!==hash(policy)||!/^[a-f0-9]{64}$/.test(value.state_hash)||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.sequence)||value.sequence<0||value.sequence>10000||(value.sequence===0?value.event_hash!==null:!/^[a-f0-9]{64}$/.test(value.event_hash)))throw new Error('Invalid governance checkpoint.');
 return value;
}
export function verifySnapshot(state,expected,independentPolicy){
 validatePolicy(independentPolicy);validateCheckpoint(expected,independentPolicy);
 exact(state,['policy','version','frozen','requests','audit']);
 if(typeof state.frozen!=='boolean'||state.version!==expected.version||!state.requests||Array.isArray(state.requests)||hash(state.policy)!==hash(independentPolicy)||hash(checkpoint(state))!==hash(expected)||!verifyAudit(state.audit,expected))throw new Error('Snapshot does not match independent authority and history.');
 return state;
}
export function checkpointCommitment(value,keyId){return {domain:'leqvor-founder-checkpoint-approval-v1',platform:'leqvor.vercel.app',checkpoint:value,signer_key_id:keyId};}
// A public file is evidence, never a replacement for an independently retained
// policy/checkpoint. Both current founder signatures are required for export.
export function verifyCheckpointPacket(packet,policy,previous=null){
 try{
  validatePolicy(policy);exact(packet,['checkpoint','approvals']);validateCheckpoint(packet.checkpoint,policy);
  if(previous){validateCheckpoint(previous,policy);if(packet.checkpoint.sequence<=previous.sequence||packet.checkpoint.version<previous.version)return false;}
  if(!Array.isArray(packet.approvals)||packet.approvals.length<policy.threshold||packet.approvals.length>3||new Set(packet.approvals.map(a=>a.slot)).size!==packet.approvals.length||new Set(packet.approvals.map(a=>a.key_id)).size!==packet.approvals.length)return false;
  return packet.approvals.every(a=>verifyCommitment(checkpointCommitment(packet.checkpoint,a.key_id),a,policy));
 }catch{return false;}
}
