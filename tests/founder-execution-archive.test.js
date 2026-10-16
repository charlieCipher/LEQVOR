// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,createHash,sign,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
import {PGlite} from '@electric-sql/pglite';
import {hash,encode} from '../governance/protocol.mjs';
import {PostgresExecutionJournal} from '../governance/execution-journal.mjs';
import {executionCheckpoint,executionCheckpointCommitment,verifyExecutionCheckpointPacket,createExecutionArchive,restoreExecutionArchive,retainExecutionArchive} from '../governance/execution-archive.mjs';
const databases=[],roots=[],parent=resolve('.local-release');afterEach(async()=>{for(const db of databases.splice(0))await db.close();for(const path of roots.splice(0)){if(!path.startsWith(parent+sep)||!path.includes('founder-execution-archive-test-'))throw Error('Unsafe fixture cleanup');await rm(path,{recursive:true,force:true});}});
async function fixture(){
 const keys=['A','B','C'].map((slot,i)=>{const pair=i===0?generateKeyPairSync('rsa',{modulusLength:2048}):generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:i===0?'RS256':'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)},target={operation:'synthetic-only'},executionKey=hash({fixture:'execution'}),now=Date.parse('2026-10-15T12:00:00.000Z');
 const intent={domain:'leqvor-root-execution-intent-v1',request_id:'a0000000-0000-4000-8000-000000000000',action:'TRANSFER_PLATFORM_OWNERSHIP',target_hash:hash(target),policy_hash:hash(policy),governance_version:2,expires_at:new Date(now+600000).toISOString(),idempotency_key:executionKey};
 const db=new PGlite();databases.push(db);for(const file of ['001_founder_state.sql','002_execution_journal.sql'])await db.exec(await readFile(`governance/migrations/${file}`,'utf8'));const journal=new PostgresExecutionJournal(db,{clock:()=>now});await journal.reserve(intent,target);
 const packet=snapshot=>{const checkpoint=executionCheckpoint(snapshot,policy);return {checkpoint,approvals:keys.slice(0,2).map(k=>({slot:k.pin.slot,key_id:k.pin.key_id,signature:sign('sha256',encode(executionCheckpointCommitment(checkpoint,k.pin.key_id)),k.pin.algorithm==='ES256'?{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}:k.pair.privateKey).toString('base64')}))};};
 const anchor={execution_key:executionKey,archive_hash:null,checkpoint:null};return {db,journal,policy,keys,key:executionKey,anchor,packet};
}
it('archives real journal history with mixed two-founder signatures and restores only as evidence',async()=>{
 const f=await fixture(),snapshot=await f.journal.read(f.key),input={policy:f.policy,snapshot,checkpoint_packet:f.packet(snapshot),anchor:f.anchor},archive=createExecutionArchive(input);
 const restored=restoreExecutionArchive(archive,{policy:f.policy,anchor:f.anchor,expectedHash:hash(archive)});expect(restored.snapshot).toEqual(snapshot);expect(restored.execution_allowed).toBe(false);expect(restored.provider_receipt_verified).toBe(false);
 const objects=new Map(),store={putIfAbsent:async(k,v)=>{if(!objects.has(k))objects.set(k,v);},get:async k=>objects.get(k)},first=await retainExecutionArchive({...input,store});
 await f.journal.record(f.key,'OUTCOME_UNKNOWN');const nextSnapshot=await f.journal.read(f.key),next=await retainExecutionArchive({policy:f.policy,snapshot:nextSnapshot,checkpoint_packet:f.packet(nextSnapshot),anchor:first,store});expect(next.checkpoint.sequence).toBe(2);expect(objects.size).toBe(2);
 await expect(retainExecutionArchive({...input,anchor:next,store})).rejects.toThrow();
});
it('rejects missing/duplicate quorum, checkpoint-domain confusion and substituted state',async()=>{
 const f=await fixture(),snapshot=await f.journal.read(f.key),packet=f.packet(snapshot),input={policy:f.policy,snapshot,checkpoint_packet:packet,anchor:f.anchor};
 for(const approvals of [packet.approvals.slice(0,1),[packet.approvals[0],packet.approvals[0]]])expect(()=>createExecutionArchive({...input,checkpoint_packet:{...packet,approvals}})).toThrow();
 expect(verifyExecutionCheckpointPacket({...packet,checkpoint:{...packet.checkpoint,domain:'leqvor-founder-checkpoint-approval-v1'}},f.policy)).toBe(false);
 expect(()=>createExecutionArchive({...input,snapshot:{...snapshot,status:'APPLIED'}})).toThrow();
 const altered=structuredClone(snapshot);altered.events[0].created_at='2026-10-15T12:00:01.000Z';expect(()=>createExecutionArchive({...input,snapshot:altered})).toThrow();
 const archive=createExecutionArchive(input);expect(()=>restoreExecutionArchive({...archive,previous_archive_hash:'0'.repeat(64)},{policy:f.policy,anchor:f.anchor,expectedHash:hash(archive)})).toThrow();
});
it('rejects independently re-signed forks, cross-execution anchors and terminal extensions',async()=>{
 const f=await fixture(),snapshot=await f.journal.read(f.key),packet=f.packet(snapshot),archive=createExecutionArchive({policy:f.policy,snapshot,checkpoint_packet:packet,anchor:f.anchor}),anchor={execution_key:f.key,archive_hash:hash(archive),checkpoint:packet.checkpoint};
 const next=await f.journal.record(f.key,'OUTCOME_UNKNOWN'),fork=structuredClone(next);fork.events[0].created_at='2026-10-15T12:00:02.000Z';for(const [i,e] of fork.events.entries()){e.previous_hash=i?fork.events[i-1].event_hash:null;const{event_hash:ignored,...body}=e;void ignored;e.event_hash=hash(body);}
 expect(()=>createExecutionArchive({policy:f.policy,snapshot:fork,checkpoint_packet:f.packet(fork),anchor})).toThrow(/fork/);
 expect(()=>createExecutionArchive({policy:f.policy,snapshot:next,checkpoint_packet:f.packet(next),anchor:{...anchor,execution_key:'0'.repeat(64)}})).toThrow();
 const terminal=await f.journal.record(f.key,'NOT_DISPATCHED'),terminalPacket=f.packet(terminal),terminalArchive=createExecutionArchive({policy:f.policy,snapshot:terminal,checkpoint_packet:terminalPacket,anchor});
 expect(()=>createExecutionArchive({policy:f.policy,snapshot:terminal,checkpoint_packet:terminalPacket,anchor:{execution_key:f.key,archive_hash:hash(terminalArchive),checkpoint:terminalPacket.checkpoint}})).toThrow();
});
it('does not report successful retention when storage returns different or corrupt bytes',async()=>{
 const f=await fixture(),snapshot=await f.journal.read(f.key),input={policy:f.policy,snapshot,checkpoint_packet:f.packet(snapshot),anchor:f.anchor};await expect(retainExecutionArchive({...input,store:{putIfAbsent:async()=>{},get:async()=>new Uint8Array([1,2,3])}})).rejects.toThrow();
});
it('prepares, assembles, retains and restores the explicit public-file CLI without overwriting',async()=>{
 const f=await fixture(),snapshot=await f.journal.read(f.key),packet=f.packet(snapshot),root=join(parent,`founder-execution-archive-test-${randomUUID()}`);await mkdir(root,{recursive:true});roots.push(root);
 const paths=['policy','snapshot','A','B','anchor'].map(n=>join(root,n+'.json'));await Promise.all([f.policy,snapshot,{checkpoint:packet.checkpoint,approval:packet.approvals[0]},{checkpoint:packet.checkpoint,approval:packet.approvals[1]},f.anchor].map((v,i)=>writeFile(paths[i],JSON.stringify(v),{flag:'wx'})));
 const exec=promisify(execFile),run=async args=>exec(process.execPath,['governance/execution-archive-cli.mjs',...args]),native=join(root,'native.json'),signed=join(root,'signed.json'),store=join(root,'retained'),restored=join(root,'restore.json');
 await run(['prepare',paths[0],paths[1],native]);expect(JSON.parse(await readFile(native,'utf8')).checkpoint).toEqual(packet.checkpoint);
 await run(['assemble',paths[0],paths[2],paths[3],signed]);expect(JSON.parse(await readFile(signed,'utf8'))).toEqual(packet);
 await expect(run(['assemble',paths[0],paths[2],paths[2],join(root,'rejected.json')])).rejects.toThrow();
 const head=JSON.parse((await run(['retain',paths[0],paths[1],signed,paths[4],store])).stdout);await run(['restore',paths[0],paths[4],head.archive_hash,store,restored]);expect(JSON.parse(await readFile(restored,'utf8')).execution_allowed).toBe(false);
 await expect(run(['restore',paths[0],paths[4],head.archive_hash,store,restored])).rejects.toThrow();
});
