// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {SecurityHistoryService} from '../src/modules/security/SecurityHistoryService';
import {VaultSession} from '../src/modules/security/VaultSession';
async function fixture(){
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const vault={id:crypto.randomUUID(),owner_id:crypto.randomUUID()},session=new VaultSession();session.unlock(key);
 let identity=null;const rows=[];
 const db={reviewSigningIdentity:vi.fn(async()=>identity),registerReviewSigningIdentity:vi.fn(async value=>{identity=value;}),securityEvents:vi.fn(async()=>rows),appendSecurityEvent:vi.fn(async event=>{rows.push({...event,encrypted_details:null,signature:{domain:'leqvor-security-event-v1',signing_key_id:event.signing_key_id,value:event.signature}});})};
 return {service:new SecurityHistoryService(session,vault,db),session,db,rows};
}
it('creates encrypted signing identity, appends signed events and verifies retained checkpoints',async()=>{
 const f=await fixture();try{
 expect((await f.service.snapshot(null)).state).toBe('EMPTY');const first=await f.service.review(null);
 expect(f.db.registerReviewSigningIdentity.mock.calls[0][0].private_key).toBeUndefined();
 expect((await f.service.snapshot(first)).state).toBe('VERIFIED');const second=await f.service.review(first);
 expect((await f.service.snapshot(second)).events).toHaveLength(2);expect((await f.service.snapshot(first)).state).toBe('INVALID');
 }finally{f.session.dispose();}
});
it('never displays unanchored, altered or truncated history and refuses to extend it',async()=>{
 const f=await fixture();try{const anchor=await f.service.review(null);
 expect(await f.service.snapshot(null)).toEqual({state:'UNANCHORED',events:[]});
 f.rows[0].created_at='2026-10-08T00:00:00.000Z';expect(await f.service.snapshot(anchor)).toEqual({state:'INVALID',events:[]});await expect(f.service.review(anchor)).rejects.toThrow();
 f.rows.length=0;expect((await f.service.snapshot(anchor)).state).toBe('INVALID');await expect(f.service.review(anchor)).rejects.toThrow();
 }finally{f.session.dispose();}
});
it('cold lock cancels pending work before any event upload',async()=>{
 const f=await fixture();try{f.db.securityEvents.mockImplementation(async()=>{f.session.lock();return [];});await expect(f.service.review(null)).rejects.toThrow(/locked/);expect(f.db.appendSecurityEvent).not.toHaveBeenCalled();}finally{f.session.dispose();}
});
