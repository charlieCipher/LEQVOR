import {readFile,writeFile} from 'node:fs/promises';
import {exact,hash} from './protocol.mjs';
import {verifyCheckpointPacket} from './audit.mjs';
const json=async path=>{const bytes=await readFile(path);if(bytes.length>65536)throw new Error('Public packet exceeds size limit.');return JSON.parse(bytes.toString('utf8'));};
try{
 if(process.argv.length!==6)throw new Error('Usage: node governance/checkpoint-assemble.mjs <independent-policy.json> <device-approval-1.json> <device-approval-2.json> <new-output.json>');
 const [policy,first,second]=await Promise.all(process.argv.slice(2,5).map(json));
 for(const part of [first,second])exact(part,['checkpoint','approval']);
 if(hash(first.checkpoint)!==hash(second.checkpoint))throw new Error('Devices signed different checkpoints.');
 const packet={checkpoint:first.checkpoint,approvals:[first.approval,second.approval]};
 if(!verifyCheckpointPacket(packet,policy))throw new Error('Distinct current checkpoint signatures required.');
 await writeFile(process.argv[5],JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
 console.log('Verified two-device public checkpoint saved. Retain it independently; no server data changed.');
}catch(error){console.error(error.message);process.exitCode=1;}
