import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {encode,hash,approvalCommitment} from './protocol.mjs';
import {initialGovernance,checkpoint,GovernanceEngine} from './engine.mjs';
import {replacementPossessionCommitment} from './replacement-plan.mjs';
import {checkpointCommitment} from './audit.mjs';
import {createDeviceTest,deviceTestCommitment} from './device-test.mjs';
const root=resolve('.'),output=join(root,'.local-release','founder-native-acceptance');
const java=process.env.LEQVOR_JAVA_BIN??'C:\\Program Files\\Android\\Android Studio\\jbr\\bin';
const android=join(process.env.LOCALAPPDATA,'Android','Sdk','platforms','android-36','android.jar');
const jsonRoot=join(process.env.USERPROFILE,'.gradle','caches','modules-2','files-2.1','org.json','json','20250517');
let jsonJar;
for(const entry of await readdir(jsonRoot)){const files=await readdir(join(jsonRoot,entry));if(files.includes('json-20250517.jar'))jsonJar=join(jsonRoot,entry,'json-20250517.jar');}
if(!jsonJar)throw new Error('Native protocol test requires the pinned org.json 20250517 test runtime.');
await mkdir(output,{recursive:true});
const keys=['A','B','C'].map((slot,index)=>{const pair=index===0?generateKeyPairSync('rsa',{modulusLength:2048}):generateKeyPairSync('ec',{namedCurve:'prime256v1'});const der=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:index===0?'RS256':'ES256',key_id:createHash('sha256').update(der).digest('hex'),spki:der.toString('base64')}};});
const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)};
const now=Date.parse('2026-10-12T12:00:00.000Z');
const request={domain:'leqvor-founder-request-v1',platform:policy.platform,action:'TRANSFER_PLATFORM_OWNERSHIP',target:hash({account:'synthetic-only'}),request_id:'a0000000-0000-4000-8000-000000000000',nonce:'a'.repeat(64),created_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString(),governance_version:1,policy_hash:hash(policy),phase:'PROPOSE',proposal_hash:null};
const commitment=approvalCommitment(request,keys[1].pin.key_id),derSignature=sign('sha256',encode(commitment),keys[1].pair.privateKey);
// Convert the public DER signature with Node's public verifier-compatible ASN.1 values for a cross-language comparison.
const {verify}=await import('node:crypto');
const inputs=[{z:'é 😀 </script>',a:'\n\t\u0001"\\'},[true,false,null,0,-123,9007199254740991],{'10':'ten','2':'two','0':'zero','4294967295':'not-index',a:'last'}, {'😀':1,'\ue000':2}];
const fixture={policy,request,now,policy_hash:hash(policy),key_id:keys[1].pin.key_id,commitment:encode(commitment).toString('utf8'),canonical:inputs.map(input=>({input,expected:encode(input).toString('utf8')})),der_signature:derSignature.toString('base64')};
fixture.state=initialGovernance(policy);
const event={domain:'leqvor-governance-audit-v1',id:'b0000000-0000-4000-8000-000000000000',sequence:1,previous_hash:null,created_at:new Date(now).toISOString(),event_type:'REQUEST_CREATED',details:{request}};
fixture.state.audit.push({...event,event_hash:hash(event)});
fixture.state.requests[request.request_id]={request,approvals:[],status:'PENDING',proposal_id:null,cooling_until:null};
fixture.checkpoint=checkpoint(fixture.state);fixture.checkpoint_commitment=encode(checkpointCommitment(fixture.checkpoint,keys[1].pin.key_id)).toString('utf8');
fixture.replacements=[];
fixture.device_tests=keys.slice(0,2).map(k=>{const evidence={domain:'leqvor-founder-device-evidence-v1',credential:k.pin,synthetic:true},request=createDeviceTest(evidence,now);return {slot:k.pin.slot,key_id:k.pin.key_id,evidence_hash:hash(evidence),request,commitment:encode(deviceTestCommitment(request)).toString('utf8')};});
for(const slot of ['A','B']){
 const pair=slot==='A'?generateKeyPairSync('rsa',{modulusLength:2048}):generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});
 const credential={slot,algorithm:slot==='A'?'RS256':'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')};
 const evidence={domain:'synthetic-native-test-evidence',slot},target={domain:'leqvor-founder-replacement-target-v1',slot,prior_key_id:keys.find(k=>k.pin.slot===slot).pin.key_id,credential,evidence_hash:hash(evidence),device_instance_hash:hash({fixture:slot})};
 let state=initialGovernance(policy),head=checkpoint(state),time=now;
 const engine=new GovernanceEngine({transaction:async op=>{const next=structuredClone(state),result=await op(next);state=next;return result;}},{clock:()=>time,policyPin:async()=>hash(policy)});
 const run=async op=>{const result=await op(head);head=result.checkpoint;return result.result;};
 const approve=async request=>{for(const key of keys.filter(k=>k.pin.slot!==slot))await run(anchor=>engine.approve(request.request_id,{slot:key.pin.slot,key_id:key.pin.key_id,signature:sign('sha256',encode(approvalCommitment(request,key.pin.key_id)),key.pin.algorithm==='ES256'?{key:key.pair.privateKey,dsaEncoding:'ieee-p1363'}:key.pair.privateKey).toString('base64')},anchor));};
 const proposal=await run(anchor=>engine.request({action:'REPLACE_FOUNDER_IDENTITY',target:hash(target)},anchor));await approve(proposal);time+=259200000;
 const confirmation=await run(anchor=>engine.request({action:proposal.action,target:proposal.target,proposal_id:proposal.request_id},anchor));await approve(confirmation);
 fixture.replacements.push({slot,now:time,state,checkpoint:head,packet:{request:confirmation,target,evidence},commitment:encode(replacementPossessionCommitment(confirmation,credential,target.evidence_hash)).toString('utf8')});
}
// The tested native converter emits raw R/S; obtain the expected raw value from the DER integers without a signing fallback.
let offset=2;const raw=Buffer.alloc(64);for(let i=0;i<2;i++){if(derSignature[offset++]!==2)throw Error('Unexpected test signature');let length=derSignature[offset++];if(derSignature[offset]===0){offset++;length--;}derSignature.copy(raw,i*32+32-length,offset,offset+length);offset+=length;}
if(!verify('sha256',encode(commitment),{key:keys[1].pair.publicKey,dsaEncoding:'ieee-p1363'},raw))throw Error('Test signature conversion failed');fixture.raw_signature=raw.toString('base64');
await writeFile(join(output,'public-vectors.json'),JSON.stringify(fixture));
const source=join(root,'governance','native','android');
const run=(program,args)=>{const result=spawnSync(program,args,{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr||result.stdout||'Native tool failed');if(result.stdout.trim())process.stdout.write(result.stdout);};
run(join(java,'javac.exe'),['--release','17','-classpath',`${jsonJar};${android}`,'-d',output,join(source,'src','com','lenvor','leqvor','founder','Protocol.java'),join(source,'src','com','lenvor','leqvor','founder','HardwareSigner.java'),join(source,'src','com','lenvor','leqvor','founder','HardwarePolicy.java'),join(source,'test','NativeAcceptance.java')]);
run(join(java,'java.exe'),['-classpath',`${output};${jsonJar};${android}`,'com.lenvor.leqvor.founder.NativeAcceptance',join(output,'public-vectors.json')]);
