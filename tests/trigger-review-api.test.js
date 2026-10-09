// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {Buffer} from 'node:buffer';
import {triggerReviewDecision} from '../scripts/trigger-review-decision.mjs';
import {createReviewSigningIdentity,signReviewDecision} from '../src/modules/security/reviewSignatures';
const id=()=>crypto.randomUUID();
async function fixture(){
 const now=Date.parse('2026-10-09T00:00:00Z');
 const vmk=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const signer=await createReviewSigningIdentity(vmk,id(),id());
 const request={id:id(),owner_id:id(),vault_id:id(),rule_id:id(),grant_id:id(),reviewer_id:signer.owner_id,record_revision:1,expires_at:'2026-10-10T00:00:00Z',signing_key_id:signer.id,signing_public_key:signer.public_key};
 const claims={sub:signer.owner_id,iss:'https://awdsyhxdnyfilnzamflt.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',aal:'aal1',exp:now/1000+3600,amr:[{method:'password',timestamp:now/1000}]};
 const token=()=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
 const signature=await signReviewDecision(vmk,signer,request,'APPROVED');
 const read=vi.fn(async()=>({data:request}));const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:read};
 const caller={auth:{getUser:vi.fn(async()=>({data:{user:{id:signer.owner_id}}}))},from:vi.fn(()=>query)};
 const write=vi.fn(async()=>({data:null})),writer={rpc:write};
 const factory=vi.fn((_url,key)=>key==='server-private'?writer:caller);
 const input={method:'POST',authorization:`Bearer ${token()}`,body:{request_id:request.id,outcome:'APPROVED',signature},env:{SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',VITE_SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-private'},clientFactory:factory,now};
 return {input,claims,token,request,caller,factory,write,read};
}
it('verifies real ECDSA before invoking the privileged writer with only verified session claims',async()=>{
 const f=await fixture();expect(await triggerReviewDecision(f.input)).toEqual({status:200,body:{recorded:true}});
 expect(f.write).toHaveBeenCalledWith('record_verified_v5_trigger_decision',expect.objectContaining({verified_user:f.request.reviewer_id,verified_aal:'aal1',verified_amr:f.claims.amr,decision:'APPROVED',decision_signature:f.input.body.signature}));
 expect(JSON.stringify(f.write.mock.calls)).not.toContain(f.input.authorization);
 expect(f.caller.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.read.mock.invocationCallOrder[0]);
});
it('rejects altered outcome, context, expiry, signer or signature before creating a writer',async()=>{
 for(const mutate of [f=>{f.input.body.outcome='REJECTED';},f=>{f.request.record_revision=2;},f=>{f.request.reviewer_id=id();},f=>{f.request.signing_key_id=id();},f=>{f.request.cancelled_at='2026-10-09';},f=>{f.request.expires_at='2026-10-08';},f=>{f.input.body.signature='A'.repeat(86)+'==';}]){
  const f=await fixture();mutate(f);expect((await triggerReviewDecision(f.input)).status).toBe(404);expect(f.factory).toHaveBeenCalledTimes(1);expect(f.write).not.toHaveBeenCalled();
 }
});
it('rejects failed authentication, token identity/issuer changes, stale reauth and malformed requests',async()=>{
 const f=await fixture();f.caller.auth.getUser.mockResolvedValue({error:{message:'PRIVATE_AUTH_DETAILS'}});
 expect((await triggerReviewDecision(f.input)).status).toBe(401);expect(f.read).not.toHaveBeenCalled();
 for(const patch of [{sub:id()},{iss:'https://other.supabase.co/auth/v1'},{role:'service_role'},{exp:0}]){
  const g=await fixture();Object.assign(g.claims,patch);g.input.authorization=`Bearer ${g.token()}`;expect((await triggerReviewDecision(g.input)).status).toBe(401);expect(g.write).not.toHaveBeenCalled();
 }
 const g=await fixture();g.claims.amr[0].timestamp-=600;g.input.authorization=`Bearer ${g.token()}`;expect((await triggerReviewDecision(g.input)).status).toBe(403);expect(g.read).not.toHaveBeenCalled();
 expect((await triggerReviewDecision({...g.input,method:'GET'})).status).toBe(405);
 expect((await triggerReviewDecision({...g.input,body:{...g.input.body,reviewer_id:id()}})).status).toBe(400);
 expect((await triggerReviewDecision({...g.input,env:{}})).status).toBe(503);
});
it('sanitizes failures when SQL rejects a request revoked or changed during verification',async()=>{
 const f=await fixture();f.write.mockResolvedValue({error:{message:'PRIVATE_DATABASE_CONTEXT'}});
 expect(await triggerReviewDecision(f.input)).toEqual({status:404,body:{error:'Review unavailable.'}});
});
