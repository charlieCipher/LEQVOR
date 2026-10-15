import {randomBytes,randomUUID,verify} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,sep,basename} from 'node:path';
import {exact,hash,encode,publicCredential} from './protocol.mjs';
import {readBoundedPublicFile} from './bounded-public-file.mjs';
const hex=/^[a-f0-9]{64}$/;
export function validateDeviceTest(request,credential,now){
 publicCredential(credential);exact(request,['domain','platform','purpose','slot','key_id','evidence_hash','request_id','nonce','created_at','expires_at']);
 if(request.domain!=='leqvor-founder-device-test-request-v1'||request.platform!=='leqvor.vercel.app'||request.purpose!=='PROVE_DEVICE_KEY_ONLY'||!['A','B'].includes(request.slot)||request.slot!==credential.slot||request.key_id!==credential.key_id||!hex.test(request.evidence_hash)||!hex.test(request.nonce)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.request_id))throw new Error('Invalid isolated device test');
 const start=Date.parse(request.created_at),end=Date.parse(request.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString()!==request.created_at||new Date(end).toISOString()!==request.expires_at||start>now+30000||end<=now||end<=start||end-start>600000)throw new Error('Expired device test');
 return request;
}
export function deviceTestCommitment(request){return {domain:'leqvor-founder-device-test-proof-v1',request};}
export function createDeviceTest(evidence,now=Date.now()){
 if(evidence?.domain!=='leqvor-founder-device-evidence-v1')throw new Error('Public device evidence required');
 const credential=evidence.credential;publicCredential(credential);
 return validateDeviceTest({domain:'leqvor-founder-device-test-request-v1',platform:'leqvor.vercel.app',purpose:'PROVE_DEVICE_KEY_ONLY',slot:credential.slot,key_id:credential.key_id,evidence_hash:hash(evidence),request_id:randomUUID(),nonce:randomBytes(32).toString('hex'),created_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString()},credential,now);
}
export function verifyDeviceTest(stored,result,now=Date.now()){
 exact(stored,['request','credential']);validateDeviceTest(stored.request,stored.credential,now);
 exact(result,['domain','request','slot','key_id','signature']);
 if(result.domain!=='leqvor-founder-device-test-result-v1'||hash(result.request)!==hash(stored.request)||result.slot!==stored.credential.slot||result.key_id!==stored.credential.key_id||typeof result.signature!=='string'||result.signature.length>1024)throw new Error('Device test packet differs');
 const signature=Buffer.from(result.signature,'base64');if(signature.toString('base64')!==result.signature||(stored.credential.algorithm==='ES256'&&signature.length!==64))throw new Error('Invalid proof encoding');
 if(!verify('sha256',encode(deviceTestCommitment(stored.request)),{key:publicCredential(stored.credential),...(stored.credential.algorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{})},signature))throw new Error('Device proof signature invalid');
 return {domain:'leqvor-founder-device-test-receipt-v1',request_id:stored.request.request_id,slot:result.slot,key_id:result.key_id,evidence_hash:stored.request.evidence_hash,result_hash:hash(result),status:'KEY_POSSESSION_VERIFIED_ONLY',enrollment_allowed:false,founder_authority_active:false};
}
export async function acceptDeviceTest(directory,result,now=Date.now()){
 const root=resolve('.local-release'),path=resolve(directory);if(!path.startsWith(root+sep)||!/^founder-device-test-[a-f0-9-]{36}$/.test(basename(path)))throw new Error('Explicit local issued-test directory required');
 const stored=JSON.parse((await readBoundedPublicFile(join(path,'issued.json'),65536)).toString('utf8')),receipt=verifyDeviceTest(stored,result,now);
 // Atomic local acceptance receipt: never overwrite or auto-retry. This is
 // local test replay tracking, not a remote enrollment/authorization store.
 await writeFile(join(path,'accepted.json'),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve('governance/device-test.mjs')){
 try{
  const [operation,...args]=process.argv.slice(2);
  if(operation==='issue'&&args.length===1){
   const evidence=JSON.parse((await readBoundedPublicFile(args[0],65536)).toString('utf8')),request=createDeviceTest(evidence),out=resolve('.local-release',`founder-device-test-${request.request_id}`);
   await mkdir(resolve('.local-release'),{recursive:true});await mkdir(out,{recursive:false});
   await writeFile(join(out,'issued.json'),JSON.stringify({request,credential:evidence.credential}),{flag:'wx',mode:0o600});
   await writeFile(join(out,'request.json'),JSON.stringify(request,null,2),{flag:'wx',mode:0o600});
   const nativeInput=join(out,request.slot==='A'?'windows-test-input.json':'request.json');
   if(request.slot==='A')await writeFile(nativeInput,JSON.stringify({request,evidence},null,2),{flag:'wx',mode:0o600});
   console.log(JSON.stringify({request_file:join(out,'request.json'),native_input_file:nativeInput,request_hash:hash(request),expires_at:request.expires_at,purpose:request.purpose,enrollment_allowed:false}));
  }
  else if(operation==='accept'&&args.length===2){const result=JSON.parse((await readBoundedPublicFile(args[1],65536)).toString('utf8'));console.log(JSON.stringify(await acceptDeviceTest(args[0],result)));}
  else throw new Error('Explicit issue or accept arguments required');
 }catch{console.error('Isolated device test rejected. Check public files, expiry and previous acceptance. No root authorization or enrollment performed.');process.exitCode=1;}
}
