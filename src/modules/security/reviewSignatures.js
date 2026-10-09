import {encryptRecord,decryptRecordPayload,canonical} from './v5Crypto';
import {opaqueId} from '../continuity/verificationPolicy';
const bytes=value=>new TextEncoder().encode(JSON.stringify(canonical(value)));
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function reviewPublicKey(jwk){
 if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||'d' in jwk||!/^[A-Za-z0-9_-]{43}$/.test(jwk.x)||!/^[A-Za-z0-9_-]{43}$/.test(jwk.y))throw new Error('Invalid review signing key.');
 const fields={kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y};
 const key=await crypto.subtle.importKey('jwk',fields,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
 const normalized=await crypto.subtle.exportKey('jwk',key);
 if(normalized.x!==jwk.x||normalized.y!==jwk.y)throw new Error('Invalid review signing key.');
 return key;
}
export async function createReviewSigningIdentity(vmk,owner_id,vault_id){
 opaqueId(owner_id);opaqueId(vault_id);
 // A dedicated signing key, never a reused ECDH sharing key.
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 try{
  return {...await encryptRecord(vmk,{owner_id,vault_id,metadata:{},payload:{domain:'leqvor-review-signing-key-v1',owner_id,vault_id,private_key:privateJwk}}),public_key:await crypto.subtle.exportKey('jwk',pair.publicKey)};
 }finally{privateJwk.d='';}
}
function commitment(request,outcome){
 if(!['APPROVED','REJECTED','NEEDS_REVIEW'].includes(outcome)||!Number.isSafeInteger(request.record_revision)||request.record_revision<1||!Number.isFinite(Date.parse(request.expires_at)))throw new Error('Invalid signed review context.');
 const identifiers={request_id:request.id,owner_id:request.owner_id,vault_id:request.vault_id,rule_id:request.rule_id,grant_id:request.grant_id,reviewer_id:request.reviewer_id,signing_key_id:request.signing_key_id};
 Object.values(identifiers).forEach(opaqueId);
 return {domain:'leqvor-trigger-review-decision-v1',...identifiers,record_revision:request.record_revision,expires_at:new Date(request.expires_at).toISOString(),outcome};
}
export async function signReviewDecision(vmk,identity,request,outcome){
 if(identity.owner_id!==request.reviewer_id||identity.id!==request.signing_key_id)throw new Error('Review signing identity mismatch.');
 const payload=await decryptRecordPayload(vmk,identity),jwk=payload.private_key;
 try{
  if(payload.domain!=='leqvor-review-signing-key-v1'||payload.owner_id!==identity.owner_id||payload.vault_id!==identity.vault_id||['kty','crv','x','y'].some(k=>jwk?.[k]!==identity.public_key?.[k]||jwk?.[k]!==request.signing_public_key?.[k]))throw new Error('Review signing key changed.');
  await reviewPublicKey(identity.public_key);
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  return encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,bytes(commitment(request,outcome))));
 }finally{if(jwk)jwk.d='';}
}
// expectedPublicKey must be a caller-pinned key, not just the decision's own key.
export async function verifyReviewDecision(request,decision,expectedPublicKey){
 try{
  if(decision.request_id!==request.id||decision.reviewer_id!==request.reviewer_id||decision.signing_key_id!==request.signing_key_id||typeof decision.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(decision.signature))return false;
  if(['kty','crv','x','y'].some(k=>expectedPublicKey?.[k]!==request.signing_public_key?.[k]))return false;
  const signature=decode(decision.signature);if(signature.length!==64||encode(signature)!==decision.signature)return false;
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await reviewPublicKey(expectedPublicKey),signature,bytes(commitment(request,decision.outcome)));
 }catch{return false;}
}
