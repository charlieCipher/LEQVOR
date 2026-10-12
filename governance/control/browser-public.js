import {ROOT_ACTIONS,exact,publicText} from '../public-values.mjs';
const digestPattern=/^[a-f0-9]{64}$/;
const utf8=value=>new TextEncoder().encode(publicText(value));
export async function publicHash(value){const bytes=await crypto.subtle.digest('SHA-256',utf8(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function base64(value,max){if(typeof value!=='string'||value.length>max)throw new Error('Invalid public encoding.');const decoded=atob(value);if(btoa(decoded)!==value)throw new Error('Invalid public encoding.');return Uint8Array.from(decoded,c=>c.charCodeAt(0));}
export async function browserPolicy(policy){
 exact(policy,['domain','platform','threshold','cooling_ms','credentials']);
 if(policy.domain!=='leqvor-founder-policy-v1'||policy.platform!=='leqvor.vercel.app'||policy.threshold!==2||policy.cooling_ms!==259200000||!Array.isArray(policy.credentials)||policy.credentials.length!==3)throw new Error('Invalid founder policy.');
 for(const pin of policy.credentials){
  exact(pin,['slot','key_id','algorithm','spki']);
  if(!['A','B','C'].includes(pin.slot)||!digestPattern.test(pin.key_id)||!['ES256','RS256'].includes(pin.algorithm))throw new Error('Invalid public credential.');
  const der=base64(pin.spki,2048),bytes=await crypto.subtle.digest('SHA-256',der),id=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  if(id!==pin.key_id)throw new Error('Public-key pin mismatch.');
  const key=await crypto.subtle.importKey('spki',der,pin.algorithm==='ES256'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(pin.algorithm==='RS256'&&key.algorithm.modulusLength<2048)throw new Error('Unsupported public key.');
 }
 if(new Set(policy.credentials.map(c=>c.slot)).size!==3||new Set(policy.credentials.map(c=>c.key_id)).size!==3)throw new Error('Distinct founder keys required.');
 return policy;
}
export async function browserAuthority(file,policyPin,head){
 file=structuredClone(file);head=structuredClone(head);
 exact(file,['policy','checkpoint','state']);await browserPolicy(file.policy);
 if(await publicHash(file.policy)!==policyPin||await publicHash(file.checkpoint)!==await publicHash(head))throw new Error('Independent authority pin mismatch.');
 exact(head,['policy_hash','state_hash','version','sequence','event_hash']);
 if(head.policy_hash!==policyPin||!digestPattern.test(head.state_hash)||!Number.isSafeInteger(head.version)||head.version<1||!Number.isSafeInteger(head.sequence)||head.sequence<0||head.sequence>10000||(head.sequence===0?head.event_hash!==null:!digestPattern.test(head.event_hash)))throw new Error('Invalid checkpoint.');
 const s=file.state;exact(s,['policy','version','frozen','requests','audit']);
 if(await publicHash(s.policy)!==policyPin||s.version!==head.version||typeof s.frozen!=='boolean'||!s.requests||Array.isArray(s.requests)||!Array.isArray(s.audit)||s.audit.length!==head.sequence||
    await publicHash({policy:s.policy,version:s.version,frozen:s.frozen,requests:s.requests})!==head.state_hash)throw new Error('State commitment mismatch.');
 let previous=null;
 for(const [i,row] of s.audit.entries()){
  exact(row,['domain','id','sequence','previous_hash','created_at','event_type','details','event_hash']);const {event_hash,...content}=row;
  if(row.domain!=='leqvor-governance-audit-v1'||row.sequence!==i+1||row.previous_hash!==previous||await publicHash(content)!==event_hash)throw new Error('Audit verification failed.');previous=event_hash;
 }
 if(previous!==head.event_hash)throw new Error('Audit head mismatch.');return structuredClone(file);
}
export async function browserRequest(request,authority,target,now){
 exact(request,['domain','platform','action','target','request_id','nonce','created_at','expires_at','governance_version','policy_hash','phase','proposal_hash']);
 const created=Date.parse(request.created_at),expires=Date.parse(request.expires_at);
 if(request.domain!=='leqvor-founder-request-v1'||request.platform!==authority.policy.platform||!ROOT_ACTIONS.includes(request.action)||request.target!==await publicHash(target)||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.request_id)||!digestPattern.test(request.nonce)||request.governance_version!==authority.checkpoint.version||request.policy_hash!==await publicHash(authority.policy)||
    !['PROPOSE','CONFIRM'].includes(request.phase)||(request.phase==='PROPOSE'?request.proposal_hash!==null:!digestPattern.test(request.proposal_hash))||
    !Number.isFinite(now)||!Number.isFinite(created)||!Number.isFinite(expires)||new Date(created).toISOString()!==request.created_at||new Date(expires).toISOString()!==request.expires_at||created>now+30000||expires<=now||expires<=created||expires-created>600000)throw new Error('Request failed public verification.');
 return request;
}
async function verifyPublicCommitment(commitment,approval,policy){
 exact(approval,['slot','key_id','signature']);const pin=policy.credentials.find(c=>c.slot===approval.slot&&c.key_id===approval.key_id);if(!pin)throw new Error('Unrecognized signer.');
 const signature=base64(approval.signature,1024);if(pin.algorithm==='ES256'&&signature.length!==64)throw new Error('Invalid signature size.');
 const algorithm=pin.algorithm==='ES256'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
 const key=await crypto.subtle.importKey('spki',base64(pin.spki,2048),algorithm,false,['verify']);
 const valid=await crypto.subtle.verify(pin.algorithm==='ES256'?{name:'ECDSA',hash:'SHA-256'}:algorithm,key,signature,utf8(commitment));
 if(!valid)throw new Error('Founder signature verification failed.');return structuredClone(approval);
}
export function browserApproval(request,approval,policy){return verifyPublicCommitment({domain:'leqvor-founder-approval-v1',request,signer_key_id:approval?.key_id},approval,policy);}
export async function browserCheckpointPacket(packet,policy,previous){
 exact(packet,['checkpoint','approvals']);
 if(!Array.isArray(packet.approvals)||packet.approvals.length<2||packet.approvals.length>3||new Set(packet.approvals.map(a=>a.slot)).size!==packet.approvals.length||new Set(packet.approvals.map(a=>a.key_id)).size!==packet.approvals.length||packet.checkpoint.sequence<=previous.sequence||packet.checkpoint.version<previous.version)throw new Error('New distinct checkpoint quorum required.');
 for(const approval of packet.approvals)await verifyPublicCommitment({domain:'leqvor-founder-checkpoint-approval-v1',platform:policy.platform,checkpoint:packet.checkpoint,signer_key_id:approval.key_id},approval,policy);
 return packet.checkpoint;
}
