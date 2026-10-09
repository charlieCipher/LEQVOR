import {canonical,digest} from './v5Crypto.js';
import {reviewPublicKey} from './reviewSignatures.js';
import {opaqueId} from '../continuity/verificationPolicy.js';
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const bytes=value=>new TextEncoder().encode(JSON.stringify(canonical(value)));
const hash=value=>typeof value==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(value);
export function securityEventCommitment(event){
 if(!event||Object.keys(event).some(k=>!['id','owner_id','sequence','event_type','severity','device_id','previous_hash','created_at','signing_key_id','event_hash','signature'].includes(k)))throw new Error('Unsupported security event.');
 opaqueId(event.id);opaqueId(event.owner_id);opaqueId(event.signing_key_id);
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||event.event_type!=='SECURITY_HISTORY_REVIEWED'||event.severity!=='INFO'||event.device_id!==null||!Number.isFinite(Date.parse(event.created_at))||new Date(event.created_at).toISOString()!==event.created_at||(event.sequence===1?event.previous_hash!==null:!hash(event.previous_hash)))throw new Error('Invalid security event.');
 const {id,owner_id,sequence,event_type,severity,device_id,previous_hash,created_at,signing_key_id}=event;
 return {domain:'leqvor-security-event-v1',id,owner_id,sequence,event_type,severity,device_id,previous_hash,created_at,signing_key_id};
}
export async function signSecurityEvent(privateKey,event){
 const commitment=securityEventCommitment(event),event_hash=await digest(commitment);
 return {...event,event_hash,signature:encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,bytes({...commitment,event_hash})))};
}
export async function verifySecurityEvent(publicJwk,event){
 try{
  const commitment=securityEventCommitment(event);
  if(!hash(event.event_hash)||typeof event.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(event.signature)||(await digest(commitment))!==event.event_hash)return false;
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await reviewPublicKey(publicJwk),decode(event.signature),bytes({...commitment,event_hash:event.event_hash}));
 }catch{return false;}
}
// Both pins and checkpoint come from a caller-held independent anchor, never
// from the same untrusted response. A valid signature alone cannot detect a fork.
export async function verifySecurityEventChain(events,{owner_id,pins,checkpoint}){
 try{
  opaqueId(owner_id);
  if(!Array.isArray(events)||!events.length||events.length>10000||!pins||!checkpoint||checkpoint.sequence!==events.length||!hash(checkpoint.event_hash))return false;
  let previous=null,sequence=0;
  for(const event of events){if(event.owner_id!==owner_id||event.sequence!==++sequence||event.previous_hash!==previous||!await verifySecurityEvent(pins[event.signing_key_id],event))return false;previous=event.event_hash;}
  return previous===checkpoint.event_hash;
 }catch{return false;}
}
