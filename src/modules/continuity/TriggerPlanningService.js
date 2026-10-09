import {encryptRecord,decryptRecordPayload,newId} from '../security/v5Crypto';
import {opaqueId,verificationPolicy,triggerPlan,reviewEntry} from './verificationPolicy';
import {verifyRecipientKey} from '../security/recipientKeys';
import {createReviewSigningIdentity,signReviewDecision,verifyReviewDecision,reviewPublicKey} from '../security/reviewSignatures';

// Planning only. No record-grant mutation, activation or eligibility determination.
export class TriggerPlanningService {
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 enrollSigningKey(){
  return this.session.run(async(key,active)=>{
   const existing=await this.db.reviewSigningIdentity();active();
   if(existing){this.assertOwner(existing);await reviewPublicKey(existing.public_key);active();return existing;}
   const identity=await createReviewSigningIdentity(key,this.vault.owner_id,this.vault.id);active();
   await this.db.registerReviewSigningIdentity(identity);active();return identity;
  });
 }
 requestReview(rule,person,grant){
  this.assertOwner(rule);this.assertOwner(person);this.assertOwner(grant);
  const binding=person.recipient_binding;
  const signing=person.review_signing_binding;
  if(!binding?.verified_at||binding.account_id!==grant.recipient_id||rule.record_id!==grant.record_id||grant.status!=='active')throw new Error('Choose an independently verified reviewer with an accepted selected share.');
  if(!signing?.verified_at||signing.account_id!==binding.account_id)throw new Error('Independently verify the reviewer signing key first.');
  opaqueId(signing.key_id);
  return this.session.run(async(_key,active)=>{
   await verifyRecipientKey(binding.public_key,binding.fingerprint);active();
   await verifyRecipientKey(signing.public_key,signing.fingerprint);active();
   const policies=await this.read('policy');active();
   if(!policies.find(p=>p.id===rule.policy_id)?.details.reviewer_ids.includes(person.id))throw new Error('Reviewer is not selected in this policy.');
   const {kty,crv,x,y}=signing.public_key;
   const id=await this.db.requestTriggerReview(rule.id,grant.id,{id:signing.key_id,kty,crv,x,y});active();return opaqueId(id);
  });
 }
 decide(request,outcome){
  if(request?.reviewer_id!==this.vault.owner_id)throw new Error('This review is assigned to another account.');
  opaqueId(request.id);
  if(!['APPROVED','REJECTED','NEEDS_REVIEW'].includes(outcome))throw new Error('Invalid review decision.');
  return this.session.run(async(key,active)=>{
   const identity=await this.db.reviewSigningIdentity();active();this.assertOwner(identity);
   const signature=await signReviewDecision(key,identity,request,outcome);active();
   await this.db.decideTriggerReview(request.id,outcome,signature);active();
  });
 }
 cancel(request){
  this.assertOwner(request);
  return this.session.run(async(_key,active)=>{await this.db.cancelTriggerReview(request.id);active();});
 }
 reviews(now,pinnedSigningKeys={}){
  if(!Number.isFinite(now))throw new Error('Supply the review time.');
  return this.session.run(async(_key,active)=>{
   const [requests,decisions,shares]=await Promise.all([this.db.triggerReviewRequests(),this.db.triggerReviewerDecisions(),this.db.listShares()]);active();
   const result=await Promise.all(requests.map(async request=>{
    if(request.owner_id!==this.vault.owner_id&&request.reviewer_id!==this.vault.owner_id)throw new Error('Review participant mismatch.');
    const grant=shares.find(g=>g.id===request.grant_id);
    const current=!!grant&&grant.status==='active'&&grant.owner_id===request.owner_id&&grant.recipient_id===request.reviewer_id&&grant.record_revision===request.record_revision&&Date.parse(grant.expires_at)>now&&Date.parse(request.expires_at)>now&&!request.cancelled_at;
    const decision=decisions.find(d=>d.request_id===request.id&&d.reviewer_id===request.reviewer_id);
    const verified=decision?.server_signature_verified===true&&await verifyReviewDecision(request,decision,pinnedSigningKeys[request.signing_key_id]);
    return {...request,decision:decision||null,signature_verified:verified,review_state:current?(decision?(verified?decision.outcome:'UNVERIFIED'):'PENDING'):'UNAVAILABLE',activation_enabled:false};
   }));active();return result;
  });
 }
 assertOwner(row){if(row?.owner_id!==this.vault.owner_id||row?.vault_id!==this.vault.id)throw new Error('Planning item does not belong to this vault.');opaqueId(row.id);}
 savePolicy(value,people){
  const payload=verificationPolicy(value);
  for(const id of payload.reviewer_ids){const person=people?.find(p=>p.id===id);this.assertOwner(person);}
  return this.write('policy',{},payload);
 }
 saveRule(policy,record,value){this.assertOwner(policy);this.assertOwner(record);return this.write('rule',{policy_id:policy.id,record_id:record.id},triggerPlan(value));}
 appendEntry(rule,value,evidenceRecord){
  this.assertOwner(rule);const payload=reviewEntry(value);
  if(payload.kind==='EVIDENCE_REFERENCE'&&!evidenceRecord)throw new Error('Select an encrypted evidence record.');
  if(evidenceRecord)this.assertOwner(evidenceRecord);
  return this.write('entry',{rule_id:rule.id,...(evidenceRecord?{evidence_record_id:evidenceRecord.id}:{})},payload);
 }
 write(kind,links,payload){
  return this.session.run(async(key,assertActive)=>{
   const identity={id:newId(),owner_id:this.vault.owner_id,vault_id:this.vault.id};
   const binding={kind,id:identity.id,...links};
   const encrypted=await encryptRecord(key,{...identity,metadata:{},payload:{binding,details:payload}});
   assertActive();const row=await this.db.saveTriggerPlanning(kind,{...encrypted,...links});assertActive();this.assertOwner(row);
   return row;
  });
 }
 read(kind){
  if(!['policy','rule','entry'].includes(kind))throw new Error('Invalid planning collection.');
  return this.session.run(async(key,assertActive)=>{
   const rows=await this.db.triggerPlanning(kind);assertActive();
   const result=await Promise.all(rows.map(async row=>{
    this.assertOwner(row);const payload=await decryptRecordPayload(key,row);
    const expected={kind,id:row.id,...(kind==='rule'?{policy_id:row.policy_id,record_id:row.record_id}:{}),...(kind==='entry'?{rule_id:row.rule_id,...(row.evidence_record_id?{evidence_record_id:row.evidence_record_id}:{})}:{})};
    if(JSON.stringify(payload.binding)!==JSON.stringify(expected))throw new Error('Planning integrity check failed.');
    if((kind==='policy'&&payload.details?.manual_review!==true)||(kind!=='policy'&&payload.details?.activation_enabled!==false))throw new Error('Planning safety check failed.');
    const validate=kind==='policy'?verificationPolicy:kind==='rule'?triggerPlan:reviewEntry;
    const details={...payload.details};delete details.manual_review;delete details.activation_enabled;
    return {...row,details:validate(details)};
   }));assertActive();return result;
  });
 }
}
