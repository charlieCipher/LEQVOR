// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
import {encode,hash,approvalCommitment} from '../governance/protocol.mjs';
import {createDeviceTest,deviceTestCommitment,verifyDeviceTest,acceptDeviceTest} from '../governance/device-test.mjs';
const now=Date.parse('2026-10-15T12:00:00.000Z'),roots=[],parent=resolve('.local-release');
afterEach(async()=>{for(const path of roots.splice(0)){if(!path.startsWith(parent+sep)||!path.includes('founder-device-test-'))throw Error('Unsafe fixture cleanup');await rm(path,{recursive:true,force:true});}});
function fixture(slot='B'){
 const pair=slot==='A'?generateKeyPairSync('rsa',{modulusLength:2048}):generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});
 const credential={slot,algorithm:slot==='A'?'RS256':'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')};
 const request=createDeviceTest({domain:'leqvor-founder-device-evidence-v1',credential,synthetic:true},now),stored={request,credential};
 const signature=body=>sign('sha256',encode(body),slot==='A'?pair.privateKey:{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
 const result={domain:'leqvor-founder-device-test-result-v1',request,slot,key_id:credential.key_id,signature:signature(deviceTestCommitment(request))};
 return {stored,result,signature};
}
it.each(['A','B'])('verifies fresh %s possession without granting root authority',slot=>{
 const f=fixture(slot);expect(verifyDeviceTest(f.stored,f.result,now)).toMatchObject({status:'KEY_POSSESSION_VERIFIED_ONLY',enrollment_allowed:false,founder_authority_active:false});
});
it('rejects request substitution, cross-purpose signatures and expired proofs',()=>{
 const f=fixture();
 for(const field of ['nonce','key_id','evidence_hash','purpose','domain','platform','slot','request_id']){
  const request={...f.result.request,[field]:'changed'};expect(()=>verifyDeviceTest(f.stored,{...f.result,request},now)).toThrow();
 }
 expect(()=>verifyDeviceTest(f.stored,f.result,now+600000)).toThrow();
 expect(()=>verifyDeviceTest(f.stored,{...f.result,signature:f.signature(approvalCommitment(f.stored.request,f.stored.credential.key_id))},now)).toThrow();
 expect(()=>verifyDeviceTest(f.stored,{...f.result,signature:fixture().result.signature},now)).toThrow();
 expect(()=>verifyDeviceTest(f.stored,{...f.result,signature:f.result.signature+'\n'},now)).toThrow();
 expect(()=>verifyDeviceTest(f.stored,{...f.result,extra:true},now)).toThrow();
});
it('rejects signing requests beyond the bounded window and disallows missing recovery slot C',()=>{
 const f=fixture();for(const patch of [{expires_at:new Date(now+600001).toISOString()},{created_at:new Date(now+30001).toISOString()},{created_at:'2026-10-15T12:00:00Z'},{slot:'C'},{purpose:'REMOVE_FOUNDER_ROOT'}]){
  expect(()=>verifyDeviceTest({...f.stored,request:{...f.stored.request,...patch}},f.result,now)).toThrow();
 }
});
it('accepts exactly once even for simultaneous local acceptance and rejects outside paths',async()=>{
 const f=fixture(),path=join(parent,`founder-device-test-${f.stored.request.request_id}`);await mkdir(parent,{recursive:true});await mkdir(path);roots.push(path);await writeFile(join(path,'issued.json'),JSON.stringify(f.stored),{flag:'wx'});
 const results=await Promise.allSettled([acceptDeviceTest(path,f.result,now),acceptDeviceTest(path,f.result,now)]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
 await expect(acceptDeviceTest(path,f.result,now)).rejects.toThrow();await expect(acceptDeviceTest(resolve('outside'),f.result,now)).rejects.toThrow();
});
it('issues and consumes only the explicit public-file command boundary',async()=>{
 const f=fixture('A'),root=join(parent,`founder-device-test-${f.stored.request.request_id}`);await mkdir(parent,{recursive:true});await mkdir(root);roots.push(root);
 const input=join(root,'synthetic-evidence.json');await writeFile(input,JSON.stringify({domain:'leqvor-founder-device-evidence-v1',credential:f.stored.credential,synthetic:true}));
 const run=promisify(execFile),issued=JSON.parse((await run(process.execPath,['governance/device-test.mjs','issue',input])).stdout),directory=resolve(issued.request_file,'..');roots.push(directory);
 const request=JSON.parse(await readFile(issued.request_file,'utf8'));expect(issued.request_hash).toBe(hash(request));expect(issued.enrollment_allowed).toBe(false);
 const windowsInput=JSON.parse(await readFile(issued.native_input_file,'utf8'));expect(windowsInput.request).toEqual(request);expect(hash(windowsInput.evidence)).toBe(request.evidence_hash);expect(windowsInput.evidence.credential).toEqual(f.stored.credential);
 const result={...f.result,request,signature:f.signature(deviceTestCommitment(request))},output=join(root,'synthetic-result.json');await writeFile(output,JSON.stringify(result));
 const receipt=JSON.parse((await run(process.execPath,['governance/device-test.mjs','accept',directory,output])).stdout);expect(receipt.status).toBe('KEY_POSSESSION_VERIFIED_ONLY');
 await expect(run(process.execPath,['governance/device-test.mjs','accept',directory,output])).rejects.toThrow();
});
