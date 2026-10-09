// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {TriggerPlanningService} from '../src/modules/continuity/TriggerPlanningService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {createSharingIdentity,encryptRecord} from '../src/modules/security/v5Crypto';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys';
import {createReviewSigningIdentity,signReviewDecision} from '../src/modules/security/reviewSignatures';
const id=()=>crypto.randomUUID();
it('enrolls one encrypted signing identity and reuses it without replacing its key',async()=>{
 const session=new VaultSession();session.unlock(await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 const vault={id:id(),owner_id:id()};let saved=null;
 const db={reviewSigningIdentity:vi.fn(async()=>saved),registerReviewSigningIdentity:vi.fn(async row=>{saved=row;return row.id;})};
 const service=new TriggerPlanningService(session,vault,db);
 try{
  const first=await service.enrollSigningKey(),second=await service.enrollSigningKey();
  expect(second.id).toBe(first.id);expect(db.registerReviewSigningIdentity).toHaveBeenCalledTimes(1);
  expect(saved.public_key).not.toHaveProperty('d');expect(JSON.stringify(saved)).not.toContain('private_key');
  saved={...saved,vault_id:id()};await expect(service.enrollSigningKey()).rejects.toThrow('belong');
  session.lock();await expect(service.enrollSigningKey()).rejects.toThrow('Unlock');
 }finally{session.dispose();}
});
it('pins owner-selected reviewers and rejects policy, record or identity substitution',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const session=new VaultSession();session.unlock(key);
 const vault={id:id(),owner_id:id()},recipient=id(),person={id:id(),owner_id:vault.owner_id,vault_id:vault.id};
 const identity=await createSharingIdentity(key,recipient);
 person.recipient_binding={account_id:recipient,public_key:identity.public_key,fingerprint:await recipientKeyFingerprint(identity.public_key),verified_at:'2026-10-09'};
 const signer=await createReviewSigningIdentity(key,recipient,id());
 person.review_signing_binding={account_id:recipient,key_id:signer.id,public_key:signer.public_key,fingerprint:await recipientKeyFingerprint(signer.public_key),verified_at:'2026-10-09'};
 const policyId=id(),rule={id:id(),owner_id:vault.owner_id,vault_id:vault.id,policy_id:policyId,record_id:id()},grant={id:id(),owner_id:vault.owner_id,vault_id:vault.id,recipient_id:recipient,record_id:rule.record_id,status:'active'};
 const row=await encryptRecord(key,{id:policyId,owner_id:vault.owner_id,vault_id:vault.id,metadata:{},payload:{binding:{kind:'policy',id:policyId},details:{reviewer_ids:[person.id],minimum_approvals:1,evidence_expiry_days:30,required_evidence:['Document'],instructions:'',manual_review:true}}});
 const db={triggerPlanning:async()=>[row],requestTriggerReview:vi.fn(async()=>id())};const service=new TriggerPlanningService(session,vault,db);
 try{
  await service.requestReview(rule,person,grant);expect(db.requestTriggerReview.mock.calls[0].slice(0,2)).toEqual([rule.id,grant.id]);
  expect(()=>service.requestReview(rule,person,{...grant,record_id:id()})).toThrow();
  expect(()=>service.requestReview(rule,person,{...grant,recipient_id:id()})).toThrow();
  await expect(service.requestReview({...rule,policy_id:id()},person,grant)).rejects.toThrow('policy');
 await expect(service.requestReview(rule,{...person,recipient_binding:{...person.recipient_binding,fingerprint:'A'.repeat(43)}},grant)).rejects.toThrow();
  expect(()=>service.requestReview(rule,{...person,review_signing_binding:null},grant)).toThrow('signing');
  expect(db.requestTriggerReview).toHaveBeenCalledTimes(1);
 }finally{session.dispose();}
});
it('marks expired, cancelled and revoked approvals unavailable and rejects late or foreign operations',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const session=new VaultSession();session.unlock(key);
 const vault={id:id(),owner_id:id()},signer=await createReviewSigningIdentity(key,vault.owner_id,vault.id);
 const request={id:id(),owner_id:id(),vault_id:id(),rule_id:id(),reviewer_id:vault.owner_id,grant_id:id(),record_revision:1,expires_at:'2026-10-10T00:00:00Z',signing_key_id:signer.id,signing_public_key:signer.public_key},now=Date.parse('2026-10-09T00:00:00Z');
 let share={id:request.grant_id,owner_id:request.owner_id,recipient_id:request.reviewer_id,record_revision:1,status:'active',expires_at:request.expires_at};
 const decision={request_id:request.id,reviewer_id:vault.owner_id,signing_key_id:signer.id,outcome:'APPROVED',server_signature_verified:true,signature:await signReviewDecision(key,signer,request,'APPROVED')};
 const db={triggerReviewRequests:async()=>[request],triggerReviewerDecisions:async()=>[decision],listShares:async()=>[share],decideTriggerReview:vi.fn(async()=>{}),reviewSigningIdentity:async()=>signer};
 const service=new TriggerPlanningService(session,vault,db);
 try{
  expect((await service.reviews(now))[0].review_state).toBe('UNVERIFIED');
  expect((await service.reviews(now,{[signer.id]:signer.public_key}))[0]).toMatchObject({review_state:'APPROVED',signature_verified:true,activation_enabled:false});
  expect((await service.reviews(Date.parse(request.expires_at)))[0].review_state).toBe('UNAVAILABLE');
  share={...share,status:'revoked'};expect((await service.reviews(now))[0].review_state).toBe('UNAVAILABLE');
  share={...share,status:'active'};request.cancelled_at='2026-10-09';expect((await service.reviews(now))[0].review_state).toBe('UNAVAILABLE');
  expect(()=>service.decide({...request,reviewer_id:id()},'APPROVED')).toThrow();
  expect(()=>service.decide(request,'TRANSFER')).toThrow();
  await service.decide(request,'NEEDS_REVIEW');expect(db.decideTriggerReview.mock.calls[0].slice(0,2)).toEqual([request.id,'NEEDS_REVIEW']);
  let finish;db.decideTriggerReview=()=>new Promise(resolve=>{finish=resolve;});
  const pending=service.decide(request,'APPROVED');await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));session.lock();finish();await expect(pending).rejects.toThrow('locked');
 }finally{session.dispose();}
});
