import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,X509Certificate} from 'node:crypto';
// Explicit local public review fixture only. Never runs against an account,
// phone, private key, enrollment store or production service.
if(process.argv.length!==3)throw new Error('Supply an existing local static-review directory');
const input=resolve(process.argv[2]),out=resolve('.local-release',`founder-attestation-acceptance-${randomUUID()}`);
const [evidence,policy,roots,revocation]=await Promise.all(['evidence','expectations','roots','revocation'].map(async name=>JSON.parse(await readFile(join(input,`${name}.json`),'utf8'))));
const classpath=JSON.parse(await readFile('.local-release/founder-attestation-verifier/runtime-classpath.json','utf8'));
await mkdir(out,{recursive:false});let passed=0;
async function check(label,{packet=evidence,expectations=policy,anchors=roots,status=revocation}={},expected='REJECTED'){
 const paths=[];for(const [name,value] of Object.entries({evidence:packet,roots:anchors,revocation:status,expectations})){const path=join(out,`${passed}-${name}.json`);await writeFile(path,JSON.stringify(value),{flag:'wx',mode:0o600});paths.push(path);}
 const result=spawnSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe',['-cp',classpath.join(delimiter),'leqvor.attestation.Review',...paths],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
 let body;try{body=JSON.parse(result.stdout);}catch{body={status:'REJECTED',enrollment_allowed:false};}
 if((expected==='STATIC_EVIDENCE_PASSED'&&(result.status!==0||body.status!==expected))||(expected==='REJECTED'&&result.status===0&&body.status!=='REJECTED')||body.enrollment_allowed!==false)throw new Error(`Static acceptance failed: ${label}`);
 passed++;
}
await check('captured static evidence',{},'STATIC_EVIDENCE_PASSED');
await check('substituted app signer',{expectations:{...policy,expected_signer_sha256:'0'.repeat(64)}});
await check('substituted package',{expectations:{...policy,expected_package:'com.example.untrusted'}});
await check('replayed/mismatched challenge',{expectations:{...policy,expected_challenge:Buffer.alloc(32,9).toString('base64')}});
await check('wrong key pin',{expectations:{...policy,expected_key_id:'0'.repeat(64)}});
await check('unsupported future app minimum',{expectations:{...policy,minimum_app_version:2147483647}});
const leaf=new X509Certificate(Buffer.from(evidence.certificate_chain[0],'base64'));
await check('revoked leaf',{status:{entries:{[BigInt('0x'+leaf.serialNumber).toString(16)]:{status:'REVOKED'}}}});
await check('missing independent roots',{anchors:[]});
await check('truncated chain',{packet:{...evidence,certificate_chain:evidence.certificate_chain.slice(0,2)}});
const corrupt=Buffer.from(evidence.certificate_chain[0],'base64');corrupt[corrupt.length-1]^=1;
await check('modified leaf signature',{packet:{...evidence,certificate_chain:[corrupt.toString('base64'),...evidence.certificate_chain.slice(1)]}});
console.log(`${passed} off-device static-review acceptance checks passed. Every case kept enrollment disabled.`);
