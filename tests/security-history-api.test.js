// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {Buffer} from 'node:buffer';
import {securityHistoryEvent} from '../scripts/security-history-event.mjs';
import {signSecurityEvent} from '../src/modules/security/securityEventSignatures';
afterEach(()=>vi.unstubAllGlobals());
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
it('does not allow the review endpoint to claim a device action',async()=>{
 const f=await fixture();Object.assign(f.input.body,{event_type:'DEVICE_ENROLLED',device_id:crypto.randomUUID()});expect((await securityHistoryEvent(f.input)).status).toBe(400);expect(f.factory).not.toHaveBeenCalled();
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
it('uses one deadline for caller and privileged requests without forwarding bearer headers to the writer',async()=>{
 const f=await fixture(),deadline=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(deadline.signal);
 expect((await securityHistoryEvent(f.input)).status).toBe(200);
 const caller=f.factory.mock.calls[0][2],writer=f.factory.mock.calls[1][2];expect(caller.global.fetch).toBe(writer.global.fetch);expect(writer.global.headers).toBeUndefined();
 const network=vi.fn(async(_url,init)=>{if(init.signal.aborted)throw init.signal.reason;return {ok:true};});vi.stubGlobal('fetch',network);
 const upstream=new AbortController();await caller.global.fetch('https://awdsyhxdnyfilnzamflt.supabase.co/auth/v1/user',{signal:upstream.signal,headers:{Accept:'application/json'}});
 expect(network.mock.calls[0][1].headers.Accept).toBe('application/json');upstream.abort();expect(network.mock.calls[0][1].signal.aborted).toBe(true);
 deadline.abort(new DOMException('PRIVATE_TIMEOUT_CANARY','TimeoutError'));
 await expect(writer.global.fetch('https://awdsyhxdnyfilnzamflt.supabase.co/rest/v1/rpc/append_verified_v5_security_event')).rejects.toHaveProperty('name','TimeoutError');
});
it('does not start a privileged write after a timed-out identity read',async()=>{
 const f=await fixture(),deadline=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(deadline.signal);
 f.read.mockImplementation(async()=>{deadline.abort();return {};});
 const result=await securityHistoryEvent(f.input);expect(result.status).toBe(503);expect(f.factory).toHaveBeenCalledTimes(1);expect(f.write).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('does not claim success if a write loses its response after the deadline',async()=>{
 const f=await fixture(),deadline=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(deadline.signal);
 f.write.mockImplementation(async()=>{deadline.abort();return {data:f.input.body.id};});expect((await securityHistoryEvent(f.input)).status).toBe(503);
});
