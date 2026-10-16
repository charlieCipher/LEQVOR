import {exact,hash,encode,validatePolicy} from './protocol.mjs';
import {validateCheckpoint,verifySnapshot,verifyCheckpointPacket} from './audit.mjs';
import {verifyAudit} from './engine.mjs';
const hashPattern=/^[a-f0-9]{64}$/;
function validateAnchor(anchor,policy){exact(anchor,['archive_hash','checkpoint']);if(anchor.archive_hash!==null&&!hashPattern.test(anchor.archive_hash))throw new Error('Invalid independent archive anchor.');validateCheckpoint(anchor.checkpoint,policy);}
// Root governance state only. Customer ciphertext backups and the separate
// execution journal are NOT covered by this existing root checkpoint domain.
export function createGovernanceArchive({policy,snapshot,checkpoint_packet,anchor}){
 policy=structuredClone(policy);snapshot=structuredClone(snapshot);checkpoint_packet=structuredClone(checkpoint_packet);anchor=structuredClone(anchor);
 validatePolicy(policy);validateAnchor(anchor,policy);
 if(!verifyCheckpointPacket(checkpoint_packet,policy,anchor.checkpoint))throw new Error('Advancing two-founder checkpoint signatures required.');
 verifySnapshot(snapshot,checkpoint_packet.checkpoint,policy);
 if(!verifyAudit(snapshot.audit.slice(0,anchor.checkpoint.sequence),anchor.checkpoint))throw new Error('Archive history fork rejected.');
 return {domain:'leqvor-root-governance-archive-v1',policy_hash:hash(policy),previous_archive_hash:anchor.archive_hash,checkpoint_packet,snapshot};
}
export function restoreGovernanceArchive(archive,{policy,anchor,expectedHash}){
 exact(archive,['domain','policy_hash','previous_archive_hash','checkpoint_packet','snapshot']);
 if(!hashPattern.test(expectedHash)||hash(archive)!==expectedHash||archive.domain!=='leqvor-root-governance-archive-v1'||archive.policy_hash!==hash(policy)||archive.previous_archive_hash!==anchor.archive_hash)throw new Error('Archive does not match independent digest, policy or predecessor.');
 const verified=createGovernanceArchive({policy,snapshot:archive.snapshot,checkpoint_packet:archive.checkpoint_packet,anchor});
 return {snapshot:verified.snapshot,checkpoint:verified.checkpoint_packet.checkpoint,archive_hash:expectedHash};
}
export async function retainGovernanceArchive({store,policy,snapshot,checkpoint_packet,anchor}){
 if(typeof store?.putIfAbsent!=='function'||typeof store?.get!=='function')throw new Error('Explicit immutable archive storage adapter required.');
 const archive=createGovernanceArchive({policy,snapshot,checkpoint_packet,anchor}),digest=hash(archive),bytes=encode(archive);
 if(bytes.length>4194304)throw new Error('Archive exceeds reviewed capacity.');
 await store.putIfAbsent(digest,bytes);
 const retained=await store.get(digest);if(!(retained instanceof Uint8Array)||retained.length>4194304)throw new Error('Archive read-back invalid.');
 const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(retained));
 const verified=restoreGovernanceArchive(body,{policy,anchor,expectedHash:digest});
 return {archive_hash:digest,checkpoint:verified.checkpoint};
}
