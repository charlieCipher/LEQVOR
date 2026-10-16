// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Buffer} from 'node:buffer';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
import {prepareProvenanceCandidate,verifyReleaseCandidate} from '../scripts/release-provenance.mjs';
const roots=[],parent=resolve(tmpdir()),commit='a'.repeat(40);
const context={domain:'leqvor-build-context-v1',repository:'charlieCipher/LEQVOR',commit,ref:'refs/heads/main',workflow_ref:'charlieCipher/LEQVOR/.github/workflows/release-provenance.yml@refs/heads/main',run_id:'1234',run_attempt:'1'};
afterEach(async()=>{for(const root of roots.splice(0)){if(!root.startsWith(parent+sep)||!root.includes('leqvor-provenance-test-'))throw Error('Unsafe fixture cleanup.');await rm(root,{recursive:true,force:true});}});
async function fixture(){
 const root=await mkdtemp(join(parent,'leqvor-provenance-test-'));roots.push(root);
 const source=join(root,'source');await mkdir(source);
 await writeFile(join(source,'index.html'),'<title>LEQVOR</title>');await writeFile(join(source,'_headers'),"script-src 'self'; frame-ancestors 'none'");
 return {root,source,candidate:await prepareProvenanceCandidate(source,join(root,'output'),context)};
}
it('binds exact candidate bytes to the reviewed source without treating a manifest as a signature',async()=>{
 const f=await fixture();expect(await verifyReleaseCandidate(f.candidate,commit)).toEqual({commit,files:2,bytes:Buffer.byteLength('<title>LEQVOR</title>')+Buffer.byteLength("script-src 'self'; frame-ancestors 'none'"),attestation_verified:false,deployment_authorized:false});
 await writeFile(join(f.source,'index.html'),'changed');await expect(verifyReleaseCandidate(f.candidate,commit)).resolves.toMatchObject({commit});
});
it('rejects changed bytes, missing files and unmanifested files',async()=>{
 for(const mode of ['changed','missing','extra']){
  const f=await fixture();
  if(mode==='changed')await writeFile(join(f.candidate,'dist','index.html'),'<title>LEQVOR</title> changed');
  if(mode==='missing')await rm(join(f.candidate,'dist','index.html'));
  if(mode==='extra')await writeFile(join(f.candidate,'dist','extra.js'),'unexpected');
  await expect(verifyReleaseCandidate(f.candidate,commit)).rejects.toThrow();
 }
});
it('rejects replay from another source, workflow, branch, repository or invalid run context',async()=>{
 const f=await fixture();await expect(verifyReleaseCandidate(f.candidate,'b'.repeat(40))).rejects.toThrow();
 for(const change of [{repository:'attacker/LEQVOR'},{ref:'refs/heads/feature'},{workflow_ref:context.workflow_ref.replace('release-provenance','other')},{run_id:'0'},{run_attempt:'-1'},{commit:'not-a-commit'}]){
  await writeFile(join(f.candidate,'build-context.json'),JSON.stringify({...context,...change}));
  await expect(verifyReleaseCandidate(f.candidate,commit)).rejects.toThrow();
 }
});
it('rejects traversal, duplicate paths, oversized declarations and malformed digests before file access',async()=>{
 const f=await fixture(),path=join(f.candidate,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
 for(const files of [[{...manifest.files[0],path:'../outside'}],[{...manifest.files[0],path:'C:/outside'}],[{...manifest.files[0],path:'assets\\file'}],[manifest.files[0],manifest.files[0]],[{...manifest.files[0],bytes:4194305}],[{...manifest.files[0],sha256:'invalid'}]]){
  await writeFile(path,JSON.stringify({...manifest,files}));await expect(verifyReleaseCandidate(f.candidate,commit)).rejects.toThrow();
 }
});
it('rejects symlinked build directories and unexpected candidate-side files',async()=>{
 const f=await fixture();await writeFile(join(f.candidate,'private.txt'),'SYNTHETIC_ONLY');await expect(verifyReleaseCandidate(f.candidate,commit)).rejects.toThrow();await rm(join(f.candidate,'private.txt'));
 const moved=join(f.root,'moved');await rename(join(f.candidate,'dist'),moved);await symlink(moved,join(f.candidate,'dist'),'junction');await expect(verifyReleaseCandidate(f.candidate,commit)).rejects.toThrow();
});
it('does not create a candidate for an unreviewed branch or forbidden build material',async()=>{
 const f=await fixture();await expect(prepareProvenanceCandidate(f.source,join(f.root,'other'),{...context,ref:'refs/heads/feature'})).rejects.toThrow();
 await writeFile(join(f.source,'private.pem'),'SYNTHETIC_ONLY');await expect(prepareProvenanceCandidate(f.source,join(f.root,'other'),context)).rejects.toThrow();
});
it('exercises the build CLI and refuses to imply attestation or accept a mismatched reviewed revision',async()=>{
 const f=await fixture(),run=promisify(execFile),env={SystemRoot:process.env.SystemRoot,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:context.repository,GITHUB_SHA:commit,GITHUB_REF:context.ref,GITHUB_WORKFLOW_REF:context.workflow_ref,GITHUB_RUN_ID:context.run_id,GITHUB_RUN_ATTEMPT:context.run_attempt};
 const prepared=await run(process.execPath,['scripts/release-provenance.mjs','prepare',f.source,join(f.root,'cli')],{env});
 const verified=await run(process.execPath,['scripts/release-provenance.mjs','verify',prepared.stdout.trim(),commit],{env});
 expect(JSON.parse(verified.stdout)).toMatchObject({commit,attestation_verified:false,deployment_authorized:false});
 await expect(run(process.execPath,['scripts/release-provenance.mjs','verify',prepared.stdout.trim(),'b'.repeat(40)],{env})).rejects.toThrow();
 await expect(run(process.execPath,['scripts/release-provenance.mjs','prepare',f.source,join(f.root,'denied')],{env:{...env,GITHUB_ACTIONS:'false'}})).rejects.toThrow();
});
