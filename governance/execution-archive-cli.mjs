import {writeFile} from 'node:fs/promises';
import {hash,exact} from './protocol.mjs';
import {readBoundedPublicFile} from './bounded-public-file.mjs';
import {localArchiveStore} from './file-archive-store.mjs';
import {executionCheckpoint,verifyExecutionCheckpointPacket,retainExecutionArchive,restoreExecutionArchive} from './execution-archive.mjs';
async function json(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedPublicFile(path)));}
async function save(path,value,max=4194304){const text=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(text)>max)throw Error('Public output capacity exceeded');await writeFile(path,text,{flag:'wx',mode:0o600});}
try{
 const[operation,...args]=process.argv.slice(2);
 if(operation==='prepare'&&args.length===3){const[policy,snapshot]=await Promise.all(args.slice(0,2).map(json));await save(args[2],{snapshot,checkpoint:executionCheckpoint(snapshot,policy)},65536);console.log('Public native checkpoint input prepared. No signature, enrollment or operation performed.');}
 else if(operation==='assemble'&&args.length===4){const[policy,a,b]=await Promise.all(args.slice(0,3).map(json));for(const value of[a,b])exact(value,['checkpoint','approval']);if(hash(a.checkpoint)!==hash(b.checkpoint))throw Error('Checkpoint mismatch');const packet={checkpoint:a.checkpoint,approvals:[a.approval,b.approval]};if(!verifyExecutionCheckpointPacket(packet,policy))throw Error('Distinct quorum required');await save(args[3],packet);console.log('Two-founder execution checkpoint verified. This is journal evidence, not a provider receipt or execute permit.');}
 else if(operation==='retain'&&args.length===5){const[policy,snapshot,checkpoint_packet,anchor]=await Promise.all(args.slice(0,4).map(json));console.log(JSON.stringify(await retainExecutionArchive({policy,snapshot,checkpoint_packet,anchor,store:await localArchiveStore(args[4])})));}
 else if(operation==='restore'&&args.length===5){const[policy,anchor]=await Promise.all(args.slice(0,2).map(json)),store=await localArchiveStore(args[3]);const archive=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await store.get(args[2])));await save(args[4],restoreExecutionArchive(archive,{policy,anchor,expectedHash:args[2]}));console.log('Verified execution evidence restored. No database, provider or authority changed; provider reconciliation remains required.');}
 else throw Error('Explicit prepare, assemble, retain or restore public-file arguments required');
}catch{console.error('Execution archive operation rejected. Check exact public inputs, signatures, independent anchor and unused output path. No remote operation or retry performed.');process.exitCode=1;}
