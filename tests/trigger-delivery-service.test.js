// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {TriggerPlanningService} from '../src/modules/continuity/TriggerPlanningService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {encryptRecord,createSharingIdentity} from '../src/modules/security/v5Crypto';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys';
import {createReviewSigningIdentity} from '../src/modules/security/reviewSignatures';
import {verifyReviewCard} from '../src/modules/security/recipientCard';
const id=()=>crypto.randomUUID(),key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
it('delivers only independently encrypted selected evidence and rejects context substitution',async()=>{
 const ownerKey=await key(),recipientKey=await key(),owner={id:id(),owner_id:id()},recipient={id:id(),owner_id:id()};
 const os=new VaultSession(),rs=new VaultSession();os.unlock(ownerKey);rs.unlock(recipientKey);
 const identity={...await createSharingIdentity(recipientKey,recipient.owner_id),vault_id:recipient.id};
 const person={id:id(),owner_id:owner.owner_id,vault_id:owner.id,recipient_binding:{verified_at:'2026-10-09',account_id:recipient.owner_id,public_key:identity.public_key,fingerprint:await recipientKeyFingerprint(identity.public_key)}};
 const policy=await encryptRecord(ownerKey,{owner_id:owner.owner_id,vault_id:owner.id,metadata:{},payload:{details:{instructions:'PRIVATE_REVIEW_INSTRUCTIONS'}}});
 const record={...await encryptRecord(ownerKey,{owner_id:owner.owner_id,vault_id:owner.id,metadata:{title:'PRIVATE_EVIDENCE_TITLE'},payload:{notes:'PRIVATE_EVIDENCE'}}),revision:1};
 const rule={...await encryptRecord(ownerKey,{owner_id:owner.owner_id,vault_id:owner.id,metadata:{},payload:{details:{authority:'VIEW'}}}),policy_id:policy.id};
 const manifest={id:id(),owner_id:owner.owner_id,vault_id:owner.id,rule_id:rule.id,manifest_hash:'a'.repeat(64),snapshot:{recipient:{account_id:recipient.owner_id,public_key:identity.public_key},policy_payload:policy.encrypted_payload,rule_payload:rule.encrypted_payload,reviewers:[{reviewer_id:recipient.owner_id}],evidence:[{record_id:record.id,record_revision:1,requirement_index:0,observed_at:'2026-10-09T00:00:00.000Z',encrypted_payload:record.encrypted_payload,encrypted_metadata:record.encrypted_metadata}]}};
 const request={id:id(),reviewer_id:recipient.owner_id,manifest_id:manifest.id,manifest_hash:manifest.manifest_hash};
 let bundle;
 const ownerDb={deliverTriggerReview:vi.fn(async(_id,record,grant)=>{bundle={record,grant};})};
 const receiverDb={sharingIdentity:async()=>identity,readTriggerReview:async()=>bundle};
 const writer=new TriggerPlanningService(os,owner,ownerDb),reader=new TriggerPlanningService(rs,recipient,receiverDb);
 try{
  await writer.deliverReview(request.id,manifest,rule,policy,person,[record]);
  expect(JSON.stringify(bundle)).not.toContain('PRIVATE_');expect(bundle.record.id).not.toBe(record.id);
  expect((await reader.revealReview(request)).evidence[0].payload.notes).toBe('PRIVATE_EVIDENCE');
  await expect(reader.revealReview({...request,manifest_hash:'b'.repeat(64)})).rejects.toThrow('integrity');
  await expect(writer.deliverReview(request.id,manifest,rule,policy,person,[{...record,revision:2}])).rejects.toThrow('changed');
  expect(ownerDb.deliverTriggerReview).toHaveBeenCalledTimes(1);
  rs.lock();await expect(reader.revealReview(request)).rejects.toThrow('Unlock');
 }finally{os.dispose();rs.dispose();}
});
it('requires a separately confirmed signing card from the same recipient account',async()=>{
 const vmk=await key(),owner=id(),identity=await createReviewSigningIdentity(vmk,owner,id());
 const card=JSON.stringify({version:'leqvor-reviewer-v1',owner_id:owner,key_id:identity.id,public_key:identity.public_key}),fingerprint=await recipientKeyFingerprint(identity.public_key);
 expect(await verifyReviewCard(card,fingerprint,owner)).toMatchObject({account_id:owner,key_id:identity.id,fingerprint});
 await expect(verifyReviewCard(card,fingerprint,id())).rejects.toThrow('Confirm');
 await expect(verifyReviewCard(card,'A'.repeat(43),owner)).rejects.toThrow('Confirm');
 const privateCard=JSON.stringify({...JSON.parse(card),public_key:{...identity.public_key,d:'PRIVATE_KEY'}});
 await expect(verifyReviewCard(privateCard,fingerprint,owner)).rejects.toThrow('Confirm');
});
