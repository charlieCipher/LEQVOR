import {createHash,createPublicKey,verify} from 'node:crypto';
import {ROOT_ACTIONS,canonical,exact,publicText} from './public-values.mjs';
export {ROOT_ACTIONS,canonical,exact};
const hashPattern=/^[a-f0-9]{64}$/;
export const encode=value=>Buffer.from(publicText(value),'utf8');
export const hash=value=>createHash('sha256').update(encode(value)).digest('hex');
export function publicCredential(credential){
 exact(credential,['slot','key_id','algorithm','spki']);
 if(!['A','B','C'].includes(credential.slot)||!hashPattern.test(credential.key_id)||!['ES256','RS256'].includes(credential.algorithm)||typeof credential.spki!=='string'||credential.spki.length>2048)throw new Error('Invalid credential.');
 const raw=Buffer.from(credential.spki,'base64');if(raw.toString('base64')!==credential.spki||createHash('sha256').update(raw).digest('hex')!==credential.key_id)throw new Error('Invalid public pin.');
 const key=createPublicKey({key:raw,type:'spki',format:'der'});
 if(credential.algorithm==='ES256'?(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'):(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength<2048))throw new Error('Unsupported signing key.');
 return key;
}
export function validatePolicy(policy){
 exact(policy,['domain','platform','threshold','cooling_ms','credentials']);
 if(policy.domain!=='leqvor-founder-policy-v1'||policy.platform!=='leqvor.vercel.app'||policy.threshold!==2||policy.cooling_ms!==72*60*60*1000||!Array.isArray(policy.credentials)||policy.credentials.length!==3)throw new Error('Invalid root policy.');
 for(const c of policy.credentials)publicCredential(c);
 if(new Set(policy.credentials.map(c=>c.slot)).size!==3||new Set(policy.credentials.map(c=>c.key_id)).size!==3)throw new Error('Credentials must be independent distinct keys.');
 return policy;
}
export function validateRequest(request,policy,version,now){
 exact(request,['domain','platform','action','target','request_id','nonce','created_at','expires_at','governance_version','policy_hash','phase','proposal_hash']);
 if(request.domain!=='leqvor-founder-request-v1'||request.platform!==policy.platform||!ROOT_ACTIONS.includes(request.action)||!hashPattern.test(request.target)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.request_id)||!hashPattern.test(request.nonce)||request.governance_version!==version||request.policy_hash!==hash(policy))throw new Error('Request does not match current authority.');
 if(!['PROPOSE','CONFIRM'].includes(request.phase)||(request.phase==='PROPOSE'?request.proposal_hash!==null:!hashPattern.test(request.proposal_hash)))throw new Error('Invalid proposal binding.');
 const created=Date.parse(request.created_at),expires=Date.parse(request.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(created)||!Number.isFinite(expires)||new Date(created).toISOString()!==request.created_at||new Date(expires).toISOString()!==request.expires_at||created>now+30000||expires<=now||expires<=created||expires-created>600000)throw new Error('Approval challenge expired or invalid.');
 return request;
}
export function approvalCommitment(request,keyId){return {domain:'leqvor-founder-approval-v1',request,signer_key_id:keyId};}
export function verifyCommitment(commitment,approval,policy){
 try{
  exact(approval,['slot','key_id','signature']);const pin=policy.credentials.find(c=>c.slot===approval.slot&&c.key_id===approval.key_id);if(!pin)return false;
  if(typeof approval.signature!=='string'||approval.signature.length>1024)return false;
  const raw=Buffer.from(approval.signature,'base64');if(raw.toString('base64')!==approval.signature||(pin.algorithm==='ES256'&&raw.length!==64))return false;
  return verify('sha256',encode(commitment),{key:publicCredential(pin),...(pin.algorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{})},raw);
 }catch{return false;}
}
export function verifyApproval(request,approval,policy){return verifyCommitment(approvalCommitment(request,approval?.key_id),approval,policy);}
