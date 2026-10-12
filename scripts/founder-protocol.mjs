// Offline preparation only. Not an authorization service or execution endpoint.
import {createHash,createPublicKey,verify} from 'node:crypto';
export const founderEffects=Object.freeze({
 TRANSFER_PLATFORM_CONTROL:'Transfer platform governance to the exact target account.',
 REMOVE_FOUNDER:'Remove the exact founder from platform governance.',
 ROTATE_FOUNDER_KEY:'Replace the founder public-key pin with the exact target fingerprint.',
 DISABLE_FOUNDER_LOCK:'Disable the founder approval requirement.',
 CHANGE_ROOT_SECURITY:'Change the exact root security policy identified by its digest.',
 FREEZE_GOVERNANCE:'Freeze governance mutations; does not delete or unlock vaults.'
});
const fields=['domain','platform','action','target','request_id','nonce','governance_version','key_id','phase','proposal_hash','issued_at','expires_at'];
const digestPattern=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function inspectFounderRequest(request,now=Date.now()){
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==fields.length||fields.some(k=>!Object.hasOwn(request,k)))throw new Error('Unsupported founder request fields.');
 if(request.domain!=='leqvor-founder-governance-v1'||request.platform!=='leqvor.vercel.app'||!Object.hasOwn(founderEffects,request.action))throw new Error('Unsupported founder operation or platform.');
 if(!uuid.test(request.request_id)||!digestPattern.test(request.nonce)||!digestPattern.test(request.key_id)||!Number.isSafeInteger(request.governance_version)||request.governance_version<1)throw new Error('Invalid request identity.');
 const targetIsAccount=['TRANSFER_PLATFORM_CONTROL','REMOVE_FOUNDER'].includes(request.action);
 if(targetIsAccount?!uuid.test(request.target):!digestPattern.test(request.target))throw new Error('Invalid exact target.');
 if(!['PROPOSE','CONFIRM'].includes(request.phase)||(request.phase==='PROPOSE'?request.proposal_hash!==null:!digestPattern.test(request.proposal_hash)))throw new Error('Invalid confirmation binding.');
 const issued=Date.parse(request.issued_at),expires=Date.parse(request.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(issued)||!Number.isFinite(expires)||new Date(issued).toISOString()!==request.issued_at||new Date(expires).toISOString()!==request.expires_at||issued>now+30000||expires<=now||expires<=issued||expires-issued>600000)throw new Error('Request expired or outside its ten-minute signing window.');
 // Fixed field order is the protocol encoding; display and sign exactly these bytes.
 const canonical=JSON.stringify(Object.fromEntries(fields.map(k=>[k,request[k]])));
 const bytes=Buffer.from(canonical,'utf8');
 return {bytes,digest:createHash('sha256').update(bytes).digest('hex'),effect:founderEffects[request.action]};
}
export function founderPublicKeyFingerprint(publicKey){
 if(!publicKey||Object.keys(publicKey).sort().join(',')!=='crv,kty,x,y'||publicKey.kty!=='EC'||publicKey.crv!=='P-256'||![publicKey.x,publicKey.y].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)))throw new Error('Only a public P-256 key is accepted.');
 const key=createPublicKey({key:publicKey,format:'jwk'});
 return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
// This only verifies an approval packet. A trusted transactional executor must
// still enforce version, nonce consumption, cooling, signer pin and checkpoints.
export function verifyFounderApproval({request,signature},independentPublicKey,now=Date.now()){
 try{
  const inspected=inspectFounderRequest(request,now);
  if(founderPublicKeyFingerprint(independentPublicKey)!==request.key_id||typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))return false;
  const raw=Buffer.from(signature,'base64');if(raw.toString('base64')!==signature)return false;
  return verify('sha256',inspected.bytes,{key:createPublicKey({key:independentPublicKey,format:'jwk'}),dsaEncoding:'ieee-p1363'},raw);
 }catch{return false;}
}
