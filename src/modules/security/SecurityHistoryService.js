import {createReviewSigningIdentity,reviewPublicKey} from './reviewSignatures';
import {decryptRecordPayload} from './v5Crypto';
import {signSecurityEvent,verifySecurityEventChain} from './securityEventSignatures';
export class SecurityHistoryService{
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 anchor(value){
  if(!value||Object.keys(value).some(k=>!['owner_id','sequence','event_hash'].includes(k))||value.owner_id!==this.vault.owner_id||!Number.isSafeInteger(value.sequence)||value.sequence<1||typeof value.event_hash!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value.event_hash))throw new Error('Invalid independent history checkpoint.');
  return value;
 }
 async identity(key,active,register=false){
  let identity=await this.db.reviewSigningIdentity();active();
  if(!identity&&register){identity=await createReviewSigningIdentity(key,this.vault.owner_id,this.vault.id);active();await this.db.registerReviewSigningIdentity(identity);active();}
  if(!identity)return null;
  if(identity.owner_id!==this.vault.owner_id||identity.vault_id!==this.vault.id)throw new Error('Signing identity unavailable.');
  const payload=await decryptRecordPayload(key,identity),jwk=payload.private_key;
  try{
   if(payload.domain!=='leqvor-review-signing-key-v1'||payload.owner_id!==identity.owner_id||payload.vault_id!==identity.vault_id||['kty','crv','x','y'].some(k=>jwk?.[k]!==identity.public_key?.[k]))throw new Error('Signing identity integrity failed.');
   await reviewPublicKey(identity.public_key);active();
   const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);active();
   return {identity,privateKey};
  }finally{if(jwk)jwk.d='';}
 }
 events(rows){
  if(!Array.isArray(rows)||rows.length>10000)throw new Error('History exceeds the verification limit.');
  return rows.map(row=>{
   if(row.owner_id!==this.vault.owner_id||row.encrypted_details!==null||row.signature?.domain!=='leqvor-security-event-v1')throw new Error('Unsupported or foreign history.');
   const {id,owner_id,sequence,event_type,severity,device_id,previous_hash,event_hash,created_at}=row;
   return {id,owner_id,sequence,event_type,severity,device_id,previous_hash,event_hash,created_at:new Date(created_at).toISOString(),signing_key_id:row.signature.signing_key_id,signature:row.signature.value};
  });
 }
 snapshot(anchor){return this.session.run(async(key,active)=>{
  const signer=await this.identity(key,active),rows=this.events(await this.db.securityEvents());active();
  if(!rows.length)return {state:anchor?'INVALID':'EMPTY',events:[]};
  if(!signer||!anchor)return {state:'UNANCHORED',events:[]};
  this.anchor(anchor);
  const verified=await verifySecurityEventChain(rows,{owner_id:this.vault.owner_id,pins:{[signer.identity.id]:signer.identity.public_key},checkpoint:anchor});active();
  return {state:verified?'VERIFIED':'INVALID',events:verified?rows:[]};
 });}
 reconcilePending(pending,anchor){return this.session.run(async(key,active)=>{
  if(!pending||Object.keys(pending).some(k=>!['previous','next'].includes(k)))throw new Error('Invalid pending history checkpoint.');
  const next=this.anchor(pending.next),previous=pending.previous===null?null:this.anchor(pending.previous);
  const current=anchor===null?null:this.anchor(anchor),matches=(a,b)=>a===null?b===null:!!b&&a.sequence===b.sequence&&a.event_hash===b.event_hash;
  if(next.sequence!==(previous?.sequence||0)+1||!matches(current,previous)&&!matches(current,next))throw new Error('Pending checkpoint does not extend your retained history.');
  const signer=await this.identity(key,active),rows=this.events(await this.db.securityEvents());active();
  if(!signer||!await verifySecurityEventChain(rows,{owner_id:this.vault.owner_id,pins:{[signer.identity.id]:signer.identity.public_key},checkpoint:next}))return {state:'INVALID',events:[]};
  active();
  if(previous&&rows[previous.sequence-1]?.event_hash!==previous.event_hash)return {state:'INVALID',events:[]};
  return {state:'VERIFIED',events:rows};
 });}
 review(anchor,options={}){return this.recordAction(anchor,{...options,eventType:'SECURITY_HISTORY_REVIEWED',deviceId:null,execute:event=>this.db.appendSecurityEvent(event)});}
 recordAction(anchor,{beforeAppend=async()=>{},eventType,deviceId,execute}){return this.session.run(async(key,active)=>{
  const signer=await this.identity(key,active,true),rows=this.events(await this.db.securityEvents());active();
  if(rows.length){this.anchor(anchor);if(!await verifySecurityEventChain(rows,{owner_id:this.vault.owner_id,pins:{[signer.identity.id]:signer.identity.public_key},checkpoint:anchor}))throw new Error('Verify the current independent checkpoint first.');active();}
  else if(anchor)throw new Error('History was removed or truncated.');
  const head=rows.at(-1),event=await signSecurityEvent(signer.privateKey,{id:crypto.randomUUID(),owner_id:this.vault.owner_id,sequence:(head?.sequence||0)+1,event_type:eventType,severity:'INFO',device_id:deviceId,previous_hash:head?.event_hash||null,created_at:new Date().toISOString(),signing_key_id:signer.identity.id});active();
  const next=this.anchor({owner_id:this.vault.owner_id,sequence:event.sequence,event_hash:event.event_hash});
  // Retain only the public proposed checkpoint before the potentially ambiguous
  // network write. Never persist the private signer or vault key here.
  await beforeAppend(next);active();
  await execute(event);active();return next;
 });}
}
