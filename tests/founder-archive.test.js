// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdir,mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {initialGovernance,GovernanceEngine,checkpoint} from '../governance/engine.mjs';
import {hash,encode} from '../governance/protocol.mjs';
import {checkpointCommitment} from '../governance/audit.mjs';
import {createGovernanceArchive,restoreGovernanceArchive,retainGovernanceArchive} from '../governance/archive.mjs';
import {localArchiveStore} from '../governance/file-archive-store.mjs';
import {readBoundedPublicFile} from '../governance/bounded-public-file.mjs';
const roots=[],parent=resolve('.local-release');
const run=promisify(execFile);
afterEach(async()=>{for(const root of roots.splice(0)){if(!root.startsWith(parent+sep)||root===parent)throw new Error('Invalid fixture cleanup path.');await rm(root,{recursive:true,force:true});}});
async function fixture(){
 const keys=['A','B','C'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)};let state=initialGovernance(policy),head=checkpoint(state);
 const baseline={archive_hash:null,checkpoint:head},engine=new GovernanceEngine({transaction:async op=>{const next=structuredClone(state),result=await op(next);state=next;return result;}},{clock:()=>Date.parse('2026-10-13T12:00:00Z'),policyPin:async()=>hash(policy)});
 await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'founder-archive-test-'));roots.push(root);const store=await localArchiveStore(root);
 async function advance(){const response=await engine.request({action:'CHANGE_ROOT_POLICY',target:hash({review:'public'})},head);head=response.checkpoint;return {policy,snapshot:structuredClone(state),checkpoint_packet:{checkpoint:head,approvals:keys.slice(0,2).map(k=>({slot:k.pin.slot,key_id:k.pin.key_id,signature:sign('sha256',encode(checkpointCommitment(head,k.pin.key_id)),{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')}))}};}
 return {policy,baseline,store,root,advance};
}
it('retains immutable signed archives and verifies a public restore against independent anchors',async()=>{
 const f=await fixture(),first=await f.advance(),anchor=await retainGovernanceArchive({...first,anchor:f.baseline,store:f.store});
 const archive=JSON.parse((await f.store.get(anchor.archive_hash)).toString('utf8'));expect(restoreGovernanceArchive(archive,{policy:f.policy,anchor:f.baseline,expectedHash:anchor.archive_hash}).snapshot).toEqual(first.snapshot);
 // Exercise the real public-file command boundary, including independent pins
 // and refusal to overwrite an existing restored authority file.
 const inputs=['policy','snapshot','packet','parent'].map(name=>join(f.root,`${name}-input.json`));
 await Promise.all([f.policy,first.snapshot,first.checkpoint_packet,f.baseline].map((value,i)=>writeFile(inputs[i],JSON.stringify(value))));
 const retained=await run(process.execPath,['governance/archive-cli.mjs','retain',...inputs,f.root]);expect(JSON.parse(retained.stdout)).toEqual(anchor);
 const output=join(f.root,'verified-restore.json'),args=['governance/archive-cli.mjs','restore',inputs[0],inputs[3],anchor.archive_hash,f.root,output];
 await run(process.execPath,args);expect(JSON.parse(await readFile(output,'utf8'))).toEqual({policy:f.policy,checkpoint:anchor.checkpoint,state:first.snapshot});
 await expect(run(process.execPath,args)).rejects.toThrow();
 const second=await f.advance(),next=await retainGovernanceArchive({...second,anchor,store:f.store});expect(next.checkpoint.sequence).toBeGreaterThan(anchor.checkpoint.sequence);
 const future=JSON.parse((await f.store.get(next.archive_hash)).toString('utf8'));expect(restoreGovernanceArchive(future,{policy:f.policy,anchor,expectedHash:next.archive_hash}).snapshot).toEqual(second.snapshot);
 await expect(f.store.get('../private')).rejects.toThrow();expect((await readdir(f.root)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name))).toHaveLength(2);
});
it('rejects checkpoint replay, missing quorum, substituted state and archive digest changes',async()=>{
 const f=await fixture(),input=await f.advance(),archive=createGovernanceArchive({...input,anchor:f.baseline}),digest=hash(archive);
 expect(()=>restoreGovernanceArchive({...archive,previous_archive_hash:'a'.repeat(64)},{policy:f.policy,anchor:f.baseline,expectedHash:digest})).toThrow();
 expect(()=>createGovernanceArchive({...input,anchor:{archive_hash:digest,checkpoint:input.checkpoint_packet.checkpoint}})).toThrow();
 expect(()=>createGovernanceArchive({...input,checkpoint_packet:{...input.checkpoint_packet,approvals:[input.checkpoint_packet.approvals[0]]},anchor:f.baseline})).toThrow();
 expect(()=>createGovernanceArchive({...input,snapshot:{...input.snapshot,frozen:true},anchor:f.baseline})).toThrow();
 const oversized=join(f.root,'oversized.json');await writeFile(oversized,Buffer.alloc(4194305));
 await expect(readBoundedPublicFile(oversized)).rejects.toThrow();await expect(readBoundedPublicFile(f.root)).rejects.toThrow();
});
it('publishes complete files atomically and refuses corrupt existing objects instead of overwriting',async()=>{
 const f=await fixture(),input=await f.advance(),job={...input,anchor:f.baseline,store:f.store};const [a,b]=await Promise.all([retainGovernanceArchive(job),retainGovernanceArchive(job)]);expect(a).toEqual(b);expect(await readdir(f.root)).toHaveLength(1);
 const path=join(f.root,`${a.archive_hash}.json`),original=await readFile(path);await writeFile(path,'tampered');await expect(retainGovernanceArchive(job)).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('tampered');expect(original.length).toBeGreaterThan(0);
});
