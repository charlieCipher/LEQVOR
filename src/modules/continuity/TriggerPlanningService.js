import {encryptRecord,decryptRecordPayload,newId,canonical,createRecordGrant,decryptGrantedRecord,verifySharingIdentity} from '../security/v5Crypto';
import {recipientKeyFingerprint} from '../security/recipientKeys';
import {opaqueId,verificationPolicy,triggerPlan,reviewEntry} from './verificationPolicy';
import {verifyRecipientKey} from '../security/recipientKeys';
import {createReviewSigningIdentity,signReviewDecision,verifyReviewDecision,reviewPublicKey} from '../security/reviewSignatures';

// Manual review and explicit owner authorization. Never legal eligibility or
// automatic activation; reviewed invitations still require recipient acceptance.
export class TriggerPlanningService {
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 signingCard(register=false){
  return this.session.run(async(_key,active)=>{
   const identity=register?await this.enrollSigningKey():await this.db.reviewSigningIdentity();active();
   if(!identity)return null;this.assertOwner(identity);await reviewPublicKey(identity.public_key);
   const {kty,crv,x,y}=identity.public_key;const fingerprint=await recipientKeyFingerprint(identity.public_key);active();
   return {fingerprint,card:JSON.stringify({version:'leqvor-reviewer-v1',owner_id:identity.owner_id,key_id:identity.id,public_key:{kty,crv,x,y}})};
  });
 }
 manifests(){return this.session.run(async(_key,active)=>{const rows=await this.db.triggerManifests();active();rows.forEach(row=>this.assertOwner(row));return rows;});}
 deliverReview(requestId,manifest,rule,policy,person,evidence){
  opaqueId(requestId);this.assertOwner(manifest);this.assertOwner(rule);this.assertOwner(policy);this.assertOwner(person);
  if(manifest.rule_id!==rule.id||rule.policy_id!==policy.id||!Array.isArray(evidence)||evidence.length!==manifest.snapshot?.evidence?.length)throw new Error('Select the complete manifest evidence.');
  return this.session.run(async(key,active)=>{
   const binding=person.recipient_binding;
   if(!binding?.verified_at||!manifest.snapshot.reviewers.some(r=>r.reviewer_id===binding.account_id))throw new Error('Reviewer binding unavailable.');
   await verifyRecipientKey(binding.public_key,binding.fingerprint);
   const policyPayload=await decryptRecordPayload(key,policy),rulePayload=await decryptRecordPayload(key,rule),items=[];
   const same=value=>JSON.stringify(canonical(value));
   if(same(policy.encrypted_payload)!==same(manifest.snapshot.policy_payload)||same(rule.encrypted_payload)!==same(manifest.snapshot.rule_payload))throw new Error('Planning context changed.');
   for(const ref of manifest.snapshot.evidence){
    const record=evidence.find(e=>e.id===ref.record_id);this.assertOwner(record);
    if(record.revision!==ref.record_revision||same(record.encrypted_payload)!==same(ref.encrypted_payload)||same(record.encrypted_metadata)!==same(ref.encrypted_metadata))throw new Error('Evidence changed. Create a fresh manifest.');
    items.push({record_id:record.id,revision:record.revision,requirement_index:ref.requirement_index,observed_at:ref.observed_at,payload:await decryptRecordPayload(key,record)});active();
   }
   const row={...await encryptRecord(key,{owner_id:this.vault.owner_id,vault_id:this.vault.id,metadata:{title:'Selected verification context'},payload:{domain:'leqvor-review-context-v1',request_id:requestId,manifest_id:manifest.id,manifest_hash:manifest.manifest_hash,recipient:manifest.snapshot.recipient,policy:policyPayload.details,rule:rulePayload.details,evidence:items}}),revision:1};
   const grant=await createRecordGrant(key,row,binding.account_id,binding.public_key,binding.fingerprint);active();
   await this.db.deliverTriggerReview(requestId,row,grant);active();
  });
 }
 revealReview(request){
  if(request?.reviewer_id!==this.vault.owner_id)throw new Error('Review is assigned to another account.');
  return this.session.run(async(key,active)=>{
   const [identity,bundle]=await Promise.all([this.db.sharingIdentity(),this.db.readTriggerReview(request.id)]);active();
   if(identity?.owner_id!==this.vault.owner_id||identity.vault_id!==this.vault.id)throw new Error('Recipient identity unavailable.');
   await verifySharingIdentity(key,identity);
   const value=await decryptGrantedRecord(key,identity,bundle.grant,bundle.record);active();
   if(value.payload?.domain!=='leqvor-review-context-v1'||value.payload.request_id!==request.id||value.payload.manifest_id!==request.manifest_id||value.payload.manifest_hash!==request.manifest_hash)throw new Error('Review context integrity check failed.');
   return value.payload;
  });
 }
 enrollSigningKey(){
  return this.session.run(async(key,active)=>{
   const existing=await this.db.reviewSigningIdentity();active();
   if(existing){this.assertOwner(existing);await reviewPublicKey(existing.public_key);active();return existing;}
   const identity=await createReviewSigningIdentity(key,this.vault.owner_id,this.vault.id);active();
   await this.db.registerReviewSigningIdentity(identity);active();return identity;
  });
 }
 createManifest(rule,people,grants,evidence,recipient){
  this.assertOwner(rule);
  return this.session.run(async(_key,active)=>{
   const policies=await this.read('policy');active();const policy=policies.find(p=>p.id===rule.policy_id);
   if(!policy||!Array.isArray(grants)||!Array.isArray(people)||people.length!==policy.details.reviewer_ids.length||new Set(people.map(p=>p.id)).size!==people.length||!Array.isArray(evidence)||evidence.length!==policy.details.required_evidence.length)throw new Error('Select all policy reviewers and required evidence.');
   const reviewers=[];
   for(const person of people){
    this.assertOwner(person);const sharing=person.recipient_binding,signing=person.review_signing_binding;
    if(!policy.details.reviewer_ids.includes(person.id)||!sharing?.verified_at||!signing?.verified_at||sharing.account_id!==signing.account_id)throw new Error('Verify each policy reviewer independently.');
    await verifyRecipientKey(sharing.public_key,sharing.fingerprint);await verifyRecipientKey(signing.public_key,signing.fingerprint);active();
    const grant=grants?.find(g=>g.recipient_id===sharing.account_id&&g.record_id===rule.record_id&&g.status==='active');this.assertOwner(grant);opaqueId(signing.key_id);
    const {kty,crv,x,y}=signing.public_key;reviewers.push({grant_id:grant.id,signing_key_id:signing.key_id,public_key:{kty,crv,x,y}});
   }
   const refs=evidence.map(({record,observed_at},requirement_index)=>{
    this.assertOwner(record);reviewEntry({kind:'EVIDENCE_REFERENCE',observed_at});
    if(!Number.isSafeInteger(record.revision)||record.revision<1)throw new Error('Evidence revision is unavailable.');
    return {record_id:record.id,record_revision:record.revision,observed_at,requirement_index};
   });
   let selectedRecipient;
   if(recipient){this.assertOwner(recipient);const binding=recipient.recipient_binding;if(!binding?.verified_at)throw new Error('Verify the selected recipient.');await verifyRecipientKey(binding.public_key,binding.fingerprint);const {kty,crv,x,y}=binding.public_key;selectedRecipient={account_id:binding.account_id,public_key:{kty,crv,x,y}};}
   const data={target_rule:rule.id,required_approvals:policy.details.minimum_approvals,evidence_days:policy.details.evidence_expiry_days,required_evidence_count:refs.length,reviewers,evidence_refs:refs,...(selectedRecipient?{recipient:selectedRecipient}:{})};active();
   const manifest=await this.db.createTriggerManifest(data);active();this.assertOwner(manifest);
   const snapshot=manifest.snapshot,same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
   if(selectedRecipient&&!same(snapshot?.recipient,selectedRecipient))throw new Error('Manifest recipient changed.');
   if(manifest.rule_id!==rule.id||manifest.minimum_approvals!==data.required_approvals||!/^[0-9a-f]{64}$/.test(manifest.manifest_hash)||snapshot?.policy_id!==policy.id||snapshot.rule_id!==rule.id||snapshot.owner_id!==this.vault.owner_id||snapshot.vault_id!==this.vault.id||snapshot.minimum_approvals!==data.required_approvals||snapshot.evidence_days!==data.evidence_days||snapshot.required_evidence_count!==refs.length||!same(snapshot.policy_payload,policy.encrypted_payload)||!same(snapshot.rule_payload,rule.encrypted_payload))throw new Error('Policy manifest integrity check failed.');
   const expectedReviewers=reviewers.map(r=>({...r,reviewer_id:grants.find(g=>g.id===r.grant_id).recipient_id})).sort((a,b)=>a.grant_id.localeCompare(b.grant_id));
   if(!same(snapshot.reviewers,expectedReviewers)||snapshot.record?.id!==rule.record_id||grants.filter(g=>reviewers.some(r=>r.grant_id===g.id)).some(g=>g.record_revision!==snapshot.record.revision)||snapshot.evidence?.length!==refs.length)throw new Error('Manifest reference integrity check failed.');
   for(const ref of refs){const saved=snapshot.evidence.find(e=>e.requirement_index===ref.requirement_index),source=evidence[ref.requirement_index].record;
    if(!saved||saved.record_id!==ref.record_id||saved.record_revision!==ref.record_revision||Date.parse(saved.observed_at)!==Date.parse(ref.observed_at)||!same(saved.encrypted_payload,source.encrypted_payload)||!same(saved.encrypted_metadata,source.encrypted_metadata))throw new Error('Evidence manifest integrity check failed.');
   }
   return manifest;
  });
 }
 readiness(manifest){
  this.assertOwner(manifest);
  return this.session.run(async(_key,active)=>{
   const result=await this.db.triggerManifestReadiness(manifest.id);active();
   if(result.activation_enabled!==false||!['EXPIRED','STALE','BLOCKED','NEEDS_REVIEW','READY_FOR_OWNER_REVIEW'].includes(result.state))throw new Error('Invalid manifest readiness.');
   return result;
  });
 }
 authorize(manifest,record,person){
  this.assertOwner(manifest);this.assertOwner(record);this.assertOwner(person);
  const expected=manifest.snapshot?.recipient,binding=person.recipient_binding;
  if(!expected||!binding?.verified_at||binding.account_id!==expected.account_id||record.id!==manifest.snapshot.record?.id||record.revision!==manifest.snapshot.record.revision)throw new Error('Reviewed recipient or record changed.');
  return this.session.run(async(key,active)=>{
   await verifyRecipientKey(binding.public_key,binding.fingerprint);
   const {kty,crv,x,y}=binding.public_key,pub={kty,crv,x,y};
   if(JSON.stringify(canonical(pub))!==JSON.stringify(canonical(expected.public_key)))throw new Error('Reviewed recipient key changed.');
   const grant=await createRecordGrant(key,record,binding.account_id,pub,binding.fingerprint);active();
   const result=await this.db.authorizeReviewedInvitation(manifest.id,grant,pub);active();return result;
  });
 }
 requestReview(rule,person,grant,manifest){
  this.assertOwner(rule);this.assertOwner(person);this.assertOwner(grant);
  this.assertOwner(manifest);
  if(manifest.rule_id!==rule.id||!manifest.snapshot?.reviewers.some(r=>r.grant_id===grant.id&&r.reviewer_id===grant.recipient_id))throw new Error('Reviewer is not selected in this manifest.');
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
   const id=await this.db.requestTriggerReview(rule.id,grant.id,{id:signing.key_id,kty,crv,x,y},manifest.id);active();return opaqueId(id);
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
