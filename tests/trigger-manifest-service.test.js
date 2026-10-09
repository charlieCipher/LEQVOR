// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {TriggerPlanningService} from '../src/modules/continuity/TriggerPlanningService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {encryptRecord,createSharingIdentity} from '../src/modules/security/v5Crypto';
import {createReviewSigningIdentity} from '../src/modules/security/reviewSignatures';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys';
const id=()=>crypto.randomUUID();
async function fixture(){
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const session=new VaultSession();session.unlock(key);
 const vault={id:id(),owner_id:id()},person={id:id(),owner_id:vault.owner_id,vault_id:vault.id},recipient=id();
 const sharing=await createSharingIdentity(key,recipient),signer=await createReviewSigningIdentity(key,recipient,id());
 person.recipient_binding={account_id:recipient,public_key:sharing.public_key,fingerprint:await recipientKeyFingerprint(sharing.public_key),verified_at:'2026-10-09'};
 person.review_signing_binding={account_id:recipient,key_id:signer.id,public_key:signer.public_key,fingerprint:await recipientKeyFingerprint(signer.public_key),verified_at:'2026-10-09'};
 const policyId=id(),ruleId=id(),target=id();
 const policy=await encryptRecord(key,{id:policyId,owner_id:vault.owner_id,vault_id:vault.id,metadata:{},payload:{binding:{kind:'policy',id:policyId},details:{reviewer_ids:[person.id],minimum_approvals:1,evidence_expiry_days:30,required_evidence:['PRIVATE_REQUIREMENT'],instructions:'PRIVATE_INSTRUCTIONS',manual_review:true}}});
 const rule={...await encryptRecord(key,{id:ruleId,owner_id:vault.owner_id,vault_id:vault.id,metadata:{},payload:{}}),policy_id:policyId,record_id:target};
 const record={...await encryptRecord(key,{owner_id:vault.owner_id,vault_id:vault.id,metadata:{title:'PRIVATE_TITLE'},payload:{notes:'PRIVATE_EVIDENCE'}}),revision:1};
 const grant={id:id(),owner_id:vault.owner_id,vault_id:vault.id,record_id:target,record_revision:1,recipient_id:recipient,status:'active'};
 let mutate=()=>{};
 const db={triggerPlanning:async()=>[policy],createTriggerManifest:vi.fn(async data=>{
  const m={id:id(),owner_id:vault.owner_id,vault_id:vault.id,rule_id:rule.id,minimum_approvals:1,manifest_hash:'a'.repeat(64),snapshot:{owner_id:vault.owner_id,vault_id:vault.id,rule_id:rule.id,policy_id:policy.id,minimum_approvals:data.required_approvals,evidence_days:data.evidence_days,required_evidence_count:1,policy_payload:policy.encrypted_payload,rule_payload:rule.encrypted_payload,record:{id:target,revision:1},reviewers:data.reviewers.map(r=>({...r,reviewer_id:recipient})),evidence:data.evidence_refs.map(e=>({...e,encrypted_metadata:record.encrypted_metadata,encrypted_payload:record.encrypted_payload}))}};
  mutate(m);return m;
 }),triggerManifestReadiness:vi.fn(async()=>({state:'READY_FOR_OWNER_REVIEW',approvals:1,required:1,activation_enabled:false}))};
 return {session,vault,person,rule,record,grant,db,service:new TriggerPlanningService(session,vault,db),setMutation:fn=>{mutate=fn;}};
}
it('commits only opaque references and public signing keys, checks encrypted policy/evidence snapshots and keeps readiness non-activating',async()=>{
 const f=await fixture(),evidence=[{record:f.record,observed_at:'2026-10-09T00:00:00.000Z'}];
 try{
  const m=await f.service.createManifest(f.rule,[f.person],[f.grant],evidence);
  expect(JSON.stringify(f.db.createTriggerManifest.mock.calls)).not.toContain('PRIVATE_');
  expect(f.db.createTriggerManifest.mock.calls[0][0]).toMatchObject({required_approvals:1,required_evidence_count:1,evidence_days:30});
  expect(await f.service.readiness(m)).toMatchObject({state:'READY_FOR_OWNER_REVIEW',activation_enabled:false});
  f.setMutation(m=>{m.minimum_approvals=2;});await expect(f.service.createManifest(f.rule,[f.person],[f.grant],evidence)).rejects.toThrow('integrity');
  f.setMutation(m=>{m.snapshot.evidence[0].record_revision=2;});await expect(f.service.createManifest(f.rule,[f.person],[f.grant],evidence)).rejects.toThrow('integrity');
  f.db.triggerManifestReadiness.mockResolvedValue({state:'ACTIVE',activation_enabled:true});await expect(f.service.readiness(m)).rejects.toThrow('readiness');
 }finally{f.session.dispose();}
});
it('rejects incomplete or foreign planning references and requires an unlocked vault',async()=>{
 const f=await fixture(),evidence=[{record:f.record,observed_at:'2026-10-09T00:00:00.000Z'}];
 try{
  await expect(f.service.createManifest(f.rule,[],[f.grant],evidence)).rejects.toThrow('all');
  await expect(f.service.createManifest(f.rule,[f.person],[f.grant],[])).rejects.toThrow('all');
  await expect(f.service.createManifest(f.rule,[{...f.person,review_signing_binding:null}],[f.grant],evidence)).rejects.toThrow('Verify');
  await expect(f.service.createManifest(f.rule,[f.person],[f.grant],[{...evidence[0],record:{...f.record,vault_id:id()}}])).rejects.toThrow('belong');
  expect(f.db.createTriggerManifest).not.toHaveBeenCalled();
  f.session.lock();await expect(f.service.createManifest(f.rule,[f.person],[f.grant],evidence)).rejects.toThrow('Unlock');
 }finally{f.session.dispose();}
});
