// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {Buffer} from 'node:buffer';
import {verifiedDevice} from '../scripts/verified-device.mjs';
import {signDeviceChallenge} from '../src/modules/sessions/deviceProof';
import {signSecurityEvent} from '../src/modules/security/securityEventSignatures';
afterEach(()=>vi.unstubAllGlobals());
async function fixture(){
 const now=Date.now(),owner=crypto.randomUUID(),session=crypto.randomUUID(),pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const {kty,crv,x,y}=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const challenge={id:crypto.randomUUID(),owner_id:owner,vault_id:crypto.randomUUID(),device_id:crypto.randomUUID(),session_id:session,purpose:'enroll',nonce:'b'.repeat(64),public_key:{kty,crv,x,y},expires_at:new Date(now+60000).toISOString(),consumed_at:null};
 const claims={sub:owner,session_id:session,iss:'https://awdsyhxdnyfilnzamflt.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',aal:'aal1',exp:now/1000+3600,amr:[{method:'password',timestamp:Math.floor(now/1000)}]};
 const token=()=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
 const identity={id:crypto.randomUUID(),owner_id:owner,public_key:{kty,crv,x,y}};
 const event=await signSecurityEvent(pair.privateKey,{id:crypto.randomUUID(),owner_id:owner,sequence:1,event_type:'DEVICE_ENROLLED',severity:'INFO',device_id:challenge.device_id,previous_hash:null,created_at:new Date(now).toISOString(),signing_key_id:identity.id});
 const read=vi.fn(async()=>({data:challenge})),query={select:()=>query,eq:()=>query,maybeSingle:read},signerQuery={select:()=>signerQuery,eq:()=>signerQuery,maybeSingle:async()=>({data:identity})},caller={auth:{getUser:vi.fn(async()=>({data:{user:{id:owner}}}))},from:table=>table==='device_challenges'?query:signerQuery};
 const write=vi.fn(async()=>({data:challenge.device_id})),factory=vi.fn((_url,key)=>key==='private'?{rpc:write}:caller);
 const input={method:'POST',authorization:`Bearer ${token()}`,body:{challenge_id:challenge.id,signature:await signDeviceChallenge(pair.privateKey,challenge),event},env:{VERCEL_ENV:'production',SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',VITE_SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'},clientFactory:factory,now};
 return {input,challenge,claims,token,caller,read,write,factory,pair};
}
it('authenticates the exact token and verifies real possession before privileged consumption',async()=>{
 const f=await fixture();expect((await verifiedDevice(f.input)).body).toEqual({verified:true,device_id:f.challenge.device_id});expect(f.caller.auth.getUser).toHaveBeenCalledWith(f.input.authorization.slice(7));expect(f.write).toHaveBeenCalledWith('complete_verified_v5_device',expect.objectContaining({verified_session:f.claims.session_id,expected_challenge:f.challenge}));expect(f.factory.mock.calls[1][2].global.headers).toBeUndefined();
});
it('rejects wrong account/session, altered key/nonce, expired and consumed challenges before a writer',async()=>{
 for(const patch of [{owner_id:crypto.randomUUID()},{session_id:crypto.randomUUID()},{nonce:'c'.repeat(64)},{public_key:{}},{expires_at:'2000-01-01T00:00:00.000Z'},{consumed_at:new Date().toISOString()}]){const f=await fixture();Object.assign(f.challenge,patch);expect((await verifiedDevice(f.input)).status).not.toBe(200);expect(f.write).not.toHaveBeenCalled();}
});
it('rejects invalid claims, arbitrary fields and forged signatures',async()=>{
 for(const patch of [{role:'service_role'},{amr:[]},{session_id:null},{exp:0}]){const f=await fixture();Object.assign(f.claims,patch);f.input.authorization=`Bearer ${f.token()}`;expect((await verifiedDevice(f.input)).status).not.toBe(200);expect(f.read).not.toHaveBeenCalled();}
 const f=await fixture();f.input.body.privateKey='CANARY';expect((await verifiedDevice(f.input)).status).toBe(400);expect(f.factory).not.toHaveBeenCalled();delete f.input.body.privateKey;f.input.body.signature='A'.repeat(86)+'==';expect((await verifiedDevice(f.input)).status).not.toBe(200);expect(f.write).not.toHaveBeenCalled();
});
it('fails closed on a lost write response and sanitizes database errors',async()=>{
 const f=await fixture();f.write.mockResolvedValue({error:{code:'PT409',message:'SECRET'}});expect((await verifiedDevice(f.input)).status).toBe(409);
 f.write.mockResolvedValue({error:{code:'42501',message:'SECRET'}});expect(JSON.stringify(await verifiedDevice(f.input))).not.toContain('SECRET');
 const abort=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(abort.signal);f.write.mockImplementation(async()=>{abort.abort();return {data:f.challenge.device_id};});expect((await verifiedDevice(f.input)).status).toBe(503);
});
it('binds revocation to an account-signed event and never accepts an unsigned action claim',async()=>{
 const f=await fixture(),event=await signSecurityEvent(f.pair.privateKey,{...f.input.body.event,event_type:'DEVICE_REVOKED'});
 f.input.body={operation:'revoke',device_id:f.challenge.device_id,event};expect((await verifiedDevice(f.input)).status).toBe(200);expect(f.read).not.toHaveBeenCalled();expect(f.write).toHaveBeenCalledWith('revoke_verified_v5_device',expect.objectContaining({target_device:f.challenge.device_id,event_data:event}));
 f.write.mockClear();f.input.body.event={...event,signature:'A'.repeat(86)+'=='};expect((await verifiedDevice(f.input)).status).not.toBe(200);expect(f.write).not.toHaveBeenCalled();
});
