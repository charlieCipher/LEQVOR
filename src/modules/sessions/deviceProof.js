import {canonical} from '../security/v5Crypto.js';
import {reviewPublicKey} from '../security/reviewSignatures.js';
import {opaqueId} from '../continuity/verificationPolicy.js';
const bytes=value=>new TextEncoder().encode(JSON.stringify(canonical(value)));
export async function devicePublicKey(value){
 if(!value||Object.keys(value).some(k=>!['kty','crv','x','y'].includes(k)))throw new Error('Invalid device public key.');
 return reviewPublicKey(value);
}
export function deviceChallengeCommitment(row){
 if(!row||Object.keys(row).some(k=>!['id','owner_id','vault_id','device_id','session_id','purpose','nonce','public_key','expires_at','consumed_at'].includes(k)))throw new Error('Invalid device challenge.');
 for(const name of ['id','owner_id','vault_id','device_id','session_id'])opaqueId(row[name]);
 if(!['enroll','verify'].includes(row.purpose)||!/^[a-f0-9]{64}$/.test(row.nonce)||row.consumed_at!==null||!Number.isFinite(Date.parse(row.expires_at)))throw new Error('Invalid device challenge.');
 const {id,owner_id,vault_id,device_id,session_id,purpose,nonce,public_key}=row;
 return {domain:'leqvor-device-proof-v1',id,owner_id,vault_id,device_id,session_id,purpose,nonce,public_key,expires_at:new Date(row.expires_at).toISOString()};
}
export async function signDeviceChallenge(privateKey,challenge){
 await devicePublicKey(challenge.public_key);
 return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,bytes(deviceChallengeCommitment(challenge))))));
}
export async function verifyDeviceChallenge(challenge,signature){
 try{
  if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))return false;
  const raw=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
  if(btoa(String.fromCharCode(...raw))!==signature)return false;
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await devicePublicKey(challenge.public_key),raw,bytes(deviceChallengeCommitment(challenge)));
 }catch{return false;}
}
