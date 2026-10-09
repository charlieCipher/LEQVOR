// @vitest-environment node
import {it,expect} from 'vitest';
import {createReviewSigningIdentity,signReviewDecision,verifyReviewDecision} from '../src/modules/security/reviewSignatures';
const id=()=>crypto.randomUUID();
const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
it('encrypts a dedicated signing key and binds signatures to the full selected request',async()=>{
 const vmk=await key(),identity=await createReviewSigningIdentity(vmk,id(),id());
 expect(identity.public_key).not.toHaveProperty('d');expect(JSON.stringify(identity)).not.toContain('private_key');
 const request={id:id(),owner_id:id(),vault_id:id(),rule_id:id(),grant_id:id(),reviewer_id:identity.owner_id,record_revision:1,expires_at:'2026-10-10T00:00:00+00:00',signing_key_id:identity.id,signing_public_key:identity.public_key};
 const signature=await signReviewDecision(vmk,identity,request,'APPROVED');
 const decision={request_id:request.id,reviewer_id:request.reviewer_id,signing_key_id:identity.id,outcome:'APPROVED',signature};
 expect(await verifyReviewDecision(request,decision,identity.public_key)).toBe(true);
 expect(await verifyReviewDecision({...request,expires_at:'2026-10-10T00:00:00.000Z'},decision,identity.public_key)).toBe(true);
 for(const field of ['id','owner_id','vault_id','rule_id','grant_id','reviewer_id','signing_key_id'])expect(await verifyReviewDecision({...request,[field]:id()},decision,identity.public_key)).toBe(false);
 for(const patch of [{record_revision:2},{expires_at:'2026-10-11'},{record_revision:null}])expect(await verifyReviewDecision({...request,...patch},decision,identity.public_key)).toBe(false);
 expect(await verifyReviewDecision(request,{...decision,outcome:'REJECTED'},identity.public_key)).toBe(false);
 expect(await verifyReviewDecision(request,{...decision,signature:'A'.repeat(86)+'=='},identity.public_key)).toBe(false);
 expect(await verifyReviewDecision(request,decision,null)).toBe(false);
 const other=await createReviewSigningIdentity(vmk,identity.owner_id,identity.vault_id);
 expect(await verifyReviewDecision({...request,signing_public_key:other.public_key},decision,other.public_key)).toBe(false);
 await expect(signReviewDecision(await key(),identity,request,'APPROVED')).rejects.toThrow();
 await expect(signReviewDecision(vmk,other,request,'APPROVED')).rejects.toThrow('identity');
 await expect(signReviewDecision(vmk,identity,{...request,signing_public_key:other.public_key},'APPROVED')).rejects.toThrow('changed');
});
