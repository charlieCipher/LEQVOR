// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {Buffer} from 'node:buffer';
import {securityHistoryEvent} from '../scripts/security-history-event.mjs';
import {signSecurityEvent} from '../src/modules/security/securityEventSignatures';
async function fixture(){
 const now=Date.parse('2026-10-09T00:00:00Z'),owner=crypto.randomUUID(),keyId=crypto.randomUUID();
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const public_key=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const body=await signSecurityEvent(pair.privateKey,{id:crypto.randomUUID(),owner_id:owner,sequence:1,event_type:'SECURITY_HISTORY_REVIEWED',severity:'INFO',device_id:null,previous_hash:null,created_at:new Date(now).toISOString(),signing_key_id:keyId});
 const claims={sub:owner,iss:'https://awdsyhxdnyfilnzamflt.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',aal:'aal1',exp:now/1000+3600,amr:[{method:'password',timestamp:now/1000}]};
 const token=()=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
 const read=vi.fn(async()=>({data:{owner_id:owner,public_key}})),query={select:()=>query,eq:()=>query,maybeSingle:read};
 const caller={auth:{getUser:vi.fn(async()=>({data:{user:{id:owner}}}))},from:()=>query};
 const write=vi.fn(async()=>({data:body.id})),factory=vi.fn((_url,key)=>key==='private'?{rpc:write}:caller);
 const input={method:'POST',authorization:`Bearer ${token()}`,body,env:{SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',VITE_SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'},clientFactory:factory,now};
 return {input,claims,token,read,caller,write,factory};
}
it('authenticates the exact token and verifies ECDSA before privileged storage',async()=>{
 const f=await fixture();expect((await securityHistoryEvent(f.input)).status).toBe(200);
 expect(f.caller.auth.getUser).toHaveBeenCalledWith(f.input.authorization.slice(7));
 expect(f.caller.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.read.mock.invocationCallOrder[0]);
 expect(f.write).toHaveBeenCalledWith('append_verified_v5_security_event',expect.objectContaining({verified_user:f.claims.sub,event_data:f.input.body}));
 expect(JSON.stringify(f.write.mock.calls)).not.toContain(f.input.authorization);
});
it('rejects changed signatures, owner, timestamps, signer and plaintext without a writer',async()=>{
 for(const patch of [{signature:'A'.repeat(86)+'=='},{owner_id:crypto.randomUUID()},{created_at:'2026-10-08T00:00:00.000Z'},{signing_key_id:crypto.randomUUID()},{notes:'SECRET_CANARY'}]){
  const f=await fixture();Object.assign(f.input.body,patch);expect((await securityHistoryEvent(f.input)).status).not.toBe(200);expect(f.write).not.toHaveBeenCalled();
 }
});
it('requires fresh password authentication and rejects invalid account claims',async()=>{
 for(const patch of [{sub:crypto.randomUUID()},{role:'service_role'},{exp:0},{amr:[]}]){
  const f=await fixture();Object.assign(f.claims,patch);f.input.authorization=`Bearer ${f.token()}`;expect((await securityHistoryEvent(f.input)).status).not.toBe(200);expect(f.write).not.toHaveBeenCalled();
 }
 const f=await fixture();f.caller.auth.getUser.mockResolvedValue({error:{message:'PRIVATE'}});expect((await securityHistoryEvent(f.input)).status).toBe(401);expect(f.read).not.toHaveBeenCalled();
});
it('sanitizes database failures and reports concurrency conflicts',async()=>{
 const f=await fixture();f.write.mockResolvedValue({error:{code:'40001',message:'PRIVATE'}});expect((await securityHistoryEvent(f.input)).status).toBe(409);
 f.write.mockResolvedValue({error:{code:'PT409',message:'PRIVATE'}});expect((await securityHistoryEvent(f.input)).status).toBe(409);
 f.write.mockResolvedValue({error:{code:'42501',message:'PRIVATE'}});const result=await securityHistoryEvent(f.input);expect(result.status).toBe(404);expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
