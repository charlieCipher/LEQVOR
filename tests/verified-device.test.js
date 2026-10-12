// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {VerifiedDeviceService} from '../src/modules/sessions/VerifiedDeviceService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {verifyDeviceChallenge} from '../src/modules/sessions/deviceProof';
async function fixture(){
 const session=new VaultSession(),vault={id:crypto.randomUUID(),owner_id:crypto.randomUUID()};session.unlock(await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 let saved=null,challenge,identity=null;const rows=[],events=[],checkpointData=new Map(),checkpoints={getItem:k=>checkpointData.get(k)??null,setItem:(k,v)=>checkpointData.set(k,v),removeItem:k=>checkpointData.delete(k)};
 const store={get:vi.fn(async()=>saved),add:vi.fn(async(_scope,value)=>{saved=value;}),remove:vi.fn(async()=>{saved=null;})};
 const append=event=>events.push({...event,encrypted_details:null,signature:{domain:'leqvor-security-event-v1',signing_key_id:event.signing_key_id,value:event.signature}});
 const db={reviewSigningIdentity:vi.fn(async()=>identity),registerReviewSigningIdentity:vi.fn(async row=>{identity=row;}),securityEvents:vi.fn(async()=>events),devices:vi.fn(async()=>rows),beginDeviceChallenge:vi.fn(async(v,id,purpose,key)=>{challenge={id:crypto.randomUUID(),owner_id:vault.owner_id,vault_id:v,device_id:id,session_id:crypto.randomUUID(),purpose,nonce:'a'.repeat(64),public_key:key,expires_at:new Date(Date.now()+60000).toISOString(),consumed_at:null};return challenge;}),completeDeviceChallenge:vi.fn(async(id,signature,event)=>{expect(id).toBe(challenge.id);expect(await verifyDeviceChallenge(challenge,signature)).toBe(true);if(!rows.length)rows.push({id:challenge.device_id,owner_id:vault.owner_id,vault_id:vault.id,public_key:challenge.public_key,created_at:new Date().toISOString(),last_verified_at:new Date().toISOString(),revoked_at:null});append(event);return challenge.device_id;}),revokeDevice:vi.fn(async(id,event)=>{rows[0].revoked_at=new Date().toISOString();append(event);return id;})};
 return {session,vault,store,db,rows,events,checkpoints,service:new VerifiedDeviceService(session,vault,db,store,checkpoints)};
}
it('persists a non-extractable separate key before enrollment and proves it on subsequent verification',async()=>{
 const f=await fixture();try{const id=await f.service.verify();expect(f.store.add).toHaveBeenCalledOnce();const local=await f.store.get();expect(local.privateKey.extractable).toBe(false);await expect(crypto.subtle.exportKey('jwk',local.privateKey)).rejects.toThrow();expect(local.public_key.d).toBeUndefined();expect((await f.service.list())[0].current).toBe(true);await f.service.verify();expect(f.db.beginDeviceChallenge.mock.calls.map(call=>call[2])).toEqual(['enroll','verify']);expect(f.db.completeDeviceChallenge).toHaveBeenCalledTimes(2);await f.service.revoke(id);expect(await f.store.get()).toBeNull();}finally{f.session.dispose();}
});
it('does not sign or upload after Cold Lock or a changed challenge',async()=>{
 for(const mode of ['lock','owner','purpose']){const f=await fixture();try{const begin=f.db.beginDeviceChallenge.getMockImplementation();f.db.beginDeviceChallenge.mockImplementation(async(...args)=>{const c=await begin(...args);if(mode==='lock')f.session.lock();else if(mode==='owner')c.owner_id=crypto.randomUUID();else c.purpose='verify';return c;});await expect(f.service.verify()).rejects.toThrow();expect(f.db.completeDeviceChallenge).not.toHaveBeenCalled();}finally{f.session.dispose();}}
});
it('rejects revoked devices and storage failure without attempting enrollment',async()=>{
 const f=await fixture();try{await f.service.verify();f.rows[0].revoked_at=new Date().toISOString();await expect(f.service.verify()).rejects.toThrow(/revoked/);expect(f.db.beginDeviceChallenge).toHaveBeenCalledOnce();}finally{f.session.dispose();}
 const g=await fixture();try{g.store.add.mockRejectedValue(new Error('Storage blocked'));await expect(g.service.verify()).rejects.toThrow();expect(g.db.beginDeviceChallenge).not.toHaveBeenCalled();}finally{g.session.dispose();}
});
