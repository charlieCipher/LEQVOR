import {DeviceKeyStore} from './deviceKeyStore';
import {devicePublicKey,signDeviceChallenge} from './deviceProof';
import {opaqueId} from '../continuity/verificationPolicy';
import {SecurityHistoryService} from '../security/SecurityHistoryService';
import {readHistoryCheckpoints,retainPendingHistory,confirmHistoryCheckpoint} from '../security/historyCheckpointStore';
export class VerifiedDeviceService{
 constructor(session,vault,db,store=new DeviceKeyStore(),checkpoints){this.session=session;this.vault=vault;this.db=db;this.store=store;this.checkpoints=checkpoints;this.history=new SecurityHistoryService(session,vault,db);this.scope=`${vault.owner_id}:${vault.id}`;}
 async signedAction(type,id,execute,active){
  let journal=readHistoryCheckpoints(this.history,this.checkpoints);
  if(journal.pending){const checked=await this.history.reconcilePending(journal.pending,journal.anchor);active();if(checked.state!=='VERIFIED')throw new Error('Verify your independent history checkpoint before changing devices.');confirmHistoryCheckpoint(this.history,journal.pending.next,this.checkpoints);journal=readHistoryCheckpoints(this.history,this.checkpoints);}
  const next=await this.history.recordAction(journal.anchor,{eventType:type,deviceId:id,beforeAppend:next=>{active();retainPendingHistory(this.history,journal.anchor,next,this.checkpoints);},execute});active();confirmHistoryCheckpoint(this.history,next,this.checkpoints);
 }
 async local(active,create=false){
  let entry=await this.store.get(this.scope);active();
  if(!entry&&create){
   const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);active();
   const {kty,crv,x,y}=await crypto.subtle.exportKey('jwk',pair.publicKey);active();
   entry={id:crypto.randomUUID(),owner_id:this.vault.owner_id,vault_id:this.vault.id,privateKey:pair.privateKey,public_key:{kty,crv,x,y}};
   await this.store.add(this.scope,entry);active();
   entry=await this.store.get(this.scope);active();
  }
  if(!entry)return null;
  opaqueId(entry.id);
  if(entry.owner_id!==this.vault.owner_id||entry.vault_id!==this.vault.id||entry.privateKey?.type!=='private'||entry.privateKey.extractable!==false||entry.privateKey.algorithm?.name!=='ECDSA'||entry.privateKey.algorithm?.namedCurve!=='P-256'||entry.privateKey.usages?.length!==1||entry.privateKey.usages[0]!=='sign')throw new Error('Invalid local device key.');
  await devicePublicKey(entry.public_key);active();return entry;
 }
 list(){return this.session.run(async(_key,active)=>{
  const rows=await this.db.devices(this.vault.id);active();
  if(!Array.isArray(rows)||rows.length>1000)throw new Error('Device registry unavailable.');
  for(const row of rows){opaqueId(row.id);if(row.owner_id!==this.vault.owner_id||row.vault_id!==this.vault.id||!Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.last_verified_at))||(row.revoked_at!==null&&!Number.isFinite(Date.parse(row.revoked_at))))throw new Error('Device registry unavailable.');await devicePublicKey(row.public_key);active();}
  const local=await this.local(active);active();
  return rows.map(row=>({...row,current:row.id===local?.id&&['kty','crv','x','y'].every(k=>row.public_key[k]===local.public_key[k])}));
 });}
 verify(){return this.session.run(async(_key,active)=>{
  const local=await this.local(active,true),rows=await this.db.devices(this.vault.id);active();
  if(!Array.isArray(rows)||rows.length>1000)throw new Error('Device registry unavailable.');
  const registered=rows.find(row=>row.id===local.id);
  if(registered&&(registered.owner_id!==this.vault.owner_id||registered.vault_id!==this.vault.id||registered.revoked_at!==null||['kty','crv','x','y'].some(k=>registered.public_key?.[k]!==local.public_key[k])))throw new Error('Device registration revoked or changed.');
  const purpose=registered?'verify':'enroll',challenge=await this.db.beginDeviceChallenge(this.vault.id,local.id,purpose,local.public_key);active();
  if(challenge.owner_id!==this.vault.owner_id||challenge.vault_id!==this.vault.id||challenge.device_id!==local.id||challenge.purpose!==purpose||['kty','crv','x','y'].some(k=>challenge.public_key?.[k]!==local.public_key[k])||Date.parse(challenge.expires_at)<=Date.now())throw new Error('Device challenge changed.');
  const signature=await signDeviceChallenge(local.privateKey,challenge);active();
  await this.signedAction(purpose==='enroll'?'DEVICE_ENROLLED':'DEVICE_PROOF_VERIFIED',local.id,async event=>{const confirmed=await this.db.completeDeviceChallenge(challenge.id,signature,event);active();if(confirmed!==local.id)throw new Error('Device verification failed.');},active);return local.id;
 });}
 revoke(id){return this.session.run(async(_key,active)=>{
  opaqueId(id);await this.signedAction('DEVICE_REVOKED',id,async event=>{const confirmed=await this.db.revokeDevice(id,event);active();if(confirmed!==id)throw new Error('Device revocation failed.');},active);active();
  const local=await this.local(active);if(local?.id===id){await this.store.remove(this.scope);active();}
 });}
}
