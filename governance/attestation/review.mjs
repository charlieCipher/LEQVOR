import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readBoundedPublicFile} from '../bounded-public-file.mjs';
import {exact,publicCredential} from '../protocol.mjs';
async function publicTrust(url,max){
 const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 const time=Date.parse(response.headers.get('date')),ttl=Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control')??'')?.[1]),age=Number(response.headers.get('age')??0);
 if(!response.ok||!Number.isFinite(time)||!Number.isFinite(ttl)||ttl<1||!Number.isFinite(age)||age<0||age>Math.min(ttl,86400)||Date.now()-time>Math.min(ttl,86400)*1000||time>Date.now()+30000)throw new Error('Fresh official trust data unavailable');
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new Error('Public trust data too large');chunks.push(chunk);}return {body:JSON.parse(Buffer.concat(chunks).toString('utf8')),date:response.headers.get('date')};
}
let stage='inputs';
try{
 if(process.argv.length!==4)throw new Error('Two explicit public input paths required');
 const evidenceBytes=await readBoundedPublicFile(process.argv[2],65536),policyBytes=await readBoundedPublicFile(process.argv[3],65536);
 const evidence=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(evidenceBytes)),policy=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(policyBytes));
 exact(evidence,['domain','credential','attestation_challenge','certificate_chain','independently_verified']);publicCredential(evidence.credential);
 if(evidence.domain!=='leqvor-founder-device-evidence-v1'||evidence.credential.slot!=='B'||evidence.credential.algorithm!=='ES256'||!Array.isArray(evidence.certificate_chain)||evidence.certificate_chain.length<3||evidence.certificate_chain.length>10||evidence.certificate_chain.some(c=>typeof c!=='string'||c.length>16384||Buffer.from(c,'base64').toString('base64')!==c))throw new Error('Unexpected evidence');
 exact(policy,['mode','expected_key_id','expected_package','minimum_app_version','expected_signer_sha256','expected_challenge']);
 if(policy.mode!=='STATIC_EVIDENCE_REVIEW_ONLY'||policy.expected_package!=='com.lenvor.leqvor.founder'||!Number.isSafeInteger(policy.minimum_app_version)||policy.minimum_app_version<1||policy.expected_key_id!==evidence.credential.key_id||!/^[a-f0-9]{64}$/.test(policy.expected_signer_sha256)||Buffer.from(policy.expected_challenge,'base64').length!==32||Buffer.from(policy.expected_challenge,'base64').toString('base64')!==policy.expected_challenge)throw new Error('Explicit public expectations required');
 stage='official-public-trust-fetch';
 const [roots,revocation]=await Promise.all([publicTrust('https://android.googleapis.com/attestation/root',65536),publicTrust('https://android.googleapis.com/attestation/status',8388608)]);
 if(!Array.isArray(roots.body)||roots.body.length<1||!revocation.body.entries||Array.isArray(revocation.body.entries)||typeof revocation.body.entries!=='object')throw new Error('Invalid public trust sources');
 const out=resolve('.local-release',`founder-attestation-review-${randomUUID()}`);await mkdir(out,{recursive:false});
 const values=[['evidence.json',evidenceBytes],['expectations.json',policyBytes],['roots.json',JSON.stringify(roots.body)],['revocation.json',JSON.stringify(revocation.body)]];
 for(const [name,bytes] of values)await writeFile(join(out,name),bytes,{flag:'wx',mode:0o600});
 const classpath=JSON.parse(await readFile('.local-release/founder-attestation-verifier/runtime-classpath.json','utf8'));
 stage='isolated-verifier';
 const child=spawnSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe',['-cp',classpath.join(delimiter),'leqvor.attestation.Review',join(out,'evidence.json'),join(out,'roots.json'),join(out,'revocation.json'),join(out,'expectations.json')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
 if(child.status!==0)throw new Error('Static review failed');
 const result=JSON.parse(child.stdout);if(!['STATIC_EVIDENCE_PASSED','REJECTED'].includes(result.status)||result.enrollment_allowed!==false)throw new Error('Unexpected static result');
 const report={domain:'leqvor-off-device-static-review-v1',upstream_commit:'621149c4ebaeeea844d6f43098687c73c4d370a3',evidence_sha256:createHash('sha256').update(evidenceBytes).digest('hex'),trust_data_dates:{roots:roots.date,revocation:revocation.date},result,enrollment_allowed:false};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({...result,local_report:join(out,'report.json')},null,2));if(result.status!=='STATIC_EVIDENCE_PASSED')process.exitCode=1;
}catch{console.error(`Off-device static review rejected at ${stage}. No enrollment, key reset or activation occurred.`);process.exitCode=1;}
