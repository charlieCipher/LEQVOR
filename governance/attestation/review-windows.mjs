import {spawnSync} from 'node:child_process';
import {X509Certificate,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {readBoundedPublicFile} from '../bounded-public-file.mjs';
import {parseWindowsEvidence,verifyWindowsCertify} from './windows-evidence.mjs';
const rootUrl='https://www.microsoft.com/pkiops/certs/Microsoft%20TPM%20Root%20Certificate%20Authority%202014.crt';
const rootPin='870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da';
const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
function run(args,input){const r=spawnSync(openssl,args,{input,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:262144});if(r.status!==0)throw new Error('Bounded OpenSSL certificate verification failed.');return r.stdout;}
try{
 if(process.argv.length!==3)throw Error('Explicit public evidence file required');
 const evidence=JSON.parse((await readBoundedPublicFile(process.argv[2],65536)).toString('utf8')),parsed=parseWindowsEvidence(evidence);
 const response=await fetch(rootUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Official pinned root unavailable');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>65536)throw Error('Root response capacity exceeded');chunks.push(chunk);}
 const root=new X509Certificate(Buffer.concat(chunks));if(root.fingerprint256.replaceAll(':','').toLowerCase()!==rootPin||!root.ca||!root.verify(root.publicKey))throw Error('Official root pin mismatch');
 const certificates=run(['pkcs7','-inform','DER','-print_certs'],parsed.chain).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)?.map(p=>new X509Certificate(p));
 if(!certificates||certificates.length!==3||new Set(certificates.map(c=>c.fingerprint256)).size!==3)throw Error('Unsupported certificate chain shape');
 const leaf=certificates.filter(c=>!c.ca),intermediates=certificates.filter(c=>c.ca&&!c.raw.equals(root.raw));
 if(leaf.length!==1||intermediates.length!==1||!leaf[0].keyUsage?.includes('2.23.133.8.3')||!certificates.some(c=>c.raw.equals(root.raw)))throw Error('AIK chain or key usage differs');
 const folder=resolve('.local-release',`founder-windows-evidence-review-${randomUUID()}`);await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'root.pem'),root.toString(),{flag:'wx'});await writeFile(join(folder,'intermediates.pem'),intermediates.map(c=>c.toString()).join('\n'),{flag:'wx'});await writeFile(join(folder,'aik.pem'),leaf[0].toString(),{flag:'wx'});
 run(['verify','-no-CAfile','-no-CApath','-no-CAstore','-trusted',join(folder,'root.pem'),'-untrusted',join(folder,'intermediates.pem'),'-x509_strict','-check_ss_sig','-auth_level','2','-attime',String(Math.floor(Date.now()/1000)),join(folder,'aik.pem')]);
 const signature=verifyWindowsCertify(parsed,leaf[0].publicKey,{diagnosticOnly:true});
 const report={domain:'leqvor-windows-static-evidence-review-v1',status:signature.policy_accepted?'STATIC_BINDING_PASSED_REVIEW_REQUIRED':'BLOCKED_LEGACY_SHA1_ATTESTATION',evidence_hash:parsed.evidence_hash,reviewed_at:new Date().toISOString(),official_root_pin_matched:true,strict_certificate_chain_verified:true,aik_extended_key_usage_verified:true,certified_public_key_matches:true,fixed_tpm_fixed_parent_sensitive_origin:true,attestation_signature_algorithm:signature.algorithm,attestation_digest_policy_accepted:signature.policy_accepted,fresh_enrollment_nonce:false,attestation_extra_data_bytes:parsed.extraData.length,revocation_verified:false,review_host_independent:false,production_attestation_policy_reviewed:false,enrollment_allowed:false,founder_authority_active:false};
 await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({report:join(folder,'report.json'),...report}));if(!signature.policy_accepted)process.exitCode=2;
}catch{console.error('Windows static attestation review blocked. No signing, key changes, enrollment or activation performed.');process.exitCode=1;}
