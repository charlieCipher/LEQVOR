// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createPasskeyAdapter,passkeySupported} from '../src/modules/security/passkeys';
const runtime={isSecureContext:true,PublicKeyCredential:function(){},navigator:{credentials:{get(){},create(){}}}};
const setup=(enabled=true)=>{
 const auth={signInWithPasskey:vi.fn(async()=>({data:{session:{access_token:'test-only'},user:{id:'synthetic'}},error:null})),registerPasskey:vi.fn(async()=>({data:{id:'credential'},error:null})),getUser:vi.fn(async()=>({data:{user:{id:'synthetic',email_confirmed_at:'2026-10-09',is_anonymous:false}},error:null})),passkey:{list:vi.fn(async()=>({data:[],error:null}))}};
 return {auth,adapter:createPasskeyAdapter({auth},enabled,runtime)};
};
it('fails closed when pilot is disabled, insecure, unsupported or SDK is absent',async()=>{
 const t=setup(false);expect(t.adapter.available).toBe(false);await expect(t.adapter.signIn()).rejects.toMatchObject({code:'PASSKEY_UNAVAILABLE'});expect(t.auth.signInWithPasskey).not.toHaveBeenCalled();
 expect(passkeySupported({...runtime,isSecureContext:false})).toBe(false);expect(passkeySupported({isSecureContext:true})).toBe(false);expect(createPasskeyAdapter({},true,runtime).available).toBe(false);
});
it('delegates WebAuthn authentication and never handles a vault key or password',async()=>{
 const t=setup();expect((await t.adapter.signIn()).user.id).toBe('synthetic');expect(t.auth.signInWithPasskey).toHaveBeenCalledWith();expect(t.auth.registerPasskey).not.toHaveBeenCalled();
});
it('requires an authenticated confirmed account for registration',async()=>{
 const t=setup();await t.adapter.register();expect(t.auth.registerPasskey).toHaveBeenCalledOnce();t.auth.getUser.mockResolvedValue({data:{user:{id:'synthetic'}},error:null});await expect(t.adapter.register()).rejects.toMatchObject({code:'PASSKEY_FAILED'});expect(t.auth.registerPasskey).toHaveBeenCalledOnce();
});
it('sanitizes backend failures, cancellation and disabled-provider errors',async()=>{
 const t=setup();t.auth.signInWithPasskey.mockResolvedValue({error:{code:'passkey_disabled',message:'PRIVATE_CANARY'}});await expect(t.adapter.signIn()).rejects.toMatchObject({code:'PASSKEY_DISABLED'});
 t.auth.signInWithPasskey.mockRejectedValue({name:'NotAllowedError',message:'PRIVATE_CANARY'});await expect(t.adapter.signIn()).rejects.toMatchObject({code:'PASSKEY_CANCELLED'});
 t.auth.passkey.list.mockRejectedValue(new Error('PRIVATE_CANARY'));await expect(t.adapter.list()).rejects.not.toThrow('PRIVATE_CANARY');
});
it('rejects malformed credential lists and exposes only bounded public metadata',async()=>{
 const t=setup();t.auth.passkey.list.mockResolvedValue({data:{unexpected:'PRIVATE_CANARY'},error:null});await expect(t.adapter.list()).rejects.toMatchObject({code:'PASSKEY_LIST_FAILED'});
 t.auth.passkey.list.mockResolvedValue({data:[{id:'credential',created_at:'2026-10-09',friendly_name:'Device',unexpected:'PRIVATE_CANARY'}],error:null});expect(await t.adapter.list()).toEqual([{id:'credential',created_at:'2026-10-09',friendly_name:'Device'}]);
});
