// @vitest-environment node
import {it,expect} from 'vitest';
import {signSecurityEvent,verifySecurityEvent,verifySecurityEventChain} from '../src/modules/security/securityEventSignatures';
const id=()=>crypto.randomUUID();
async function fixture(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey),keyId=id(),owner=id();
 const first=await signSecurityEvent(pair.privateKey,{id:id(),owner_id:owner,sequence:1,event_type:'SECURITY_HISTORY_REVIEWED',severity:'INFO',device_id:null,previous_hash:null,created_at:'2026-10-09T00:00:00.000Z',signing_key_id:keyId});
 const second=await signSecurityEvent(pair.privateKey,{...first,id:id(),sequence:2,previous_hash:first.event_hash,created_at:'2026-10-09T00:01:00.000Z'});
 return {publicKey,first,second,anchor:{owner_id:owner,pins:{[keyId]:publicKey},checkpoint:{sequence:2,event_hash:second.event_hash}}};
}
it('verifies real signatures and a complete chain against independent anchors',async()=>{
 const f=await fixture();expect(await verifySecurityEvent(f.publicKey,f.first)).toBe(true);expect(await verifySecurityEventChain([f.first,f.second],f.anchor)).toBe(true);
});
it('rejects reordering, omission, truncation, changed owner, signer, timestamp or previous hash',async()=>{
 const f=await fixture();for(const rows of [[f.second,f.first],[f.first],[f.second],[f.first,{...f.second,owner_id:id()}],[f.first,{...f.second,signing_key_id:id()}],[f.first,{...f.second,created_at:'2026-10-09T00:02:00.000Z'}],[f.first,{...f.second,previous_hash:'A'.repeat(43)+'='}]])expect(await verifySecurityEventChain(rows,f.anchor)).toBe(false);
 expect(await verifySecurityEventChain([f.first,f.second],{...f.anchor,pins:{}})).toBe(false);expect(await verifySecurityEventChain([f.first,f.second],{...f.anchor,checkpoint:null})).toBe(false);
});
it('rejects plaintext additions, arbitrary event claims, malformed data and wrong public keys',async()=>{
 const f=await fixture(),other=await fixture();expect(await verifySecurityEvent(other.publicKey,f.first)).toBe(false);
 for(const patch of [{notes:'SECRET_CANARY'},{event_type:'DEVICE_TRUSTED'},{signature:'not a signature'},{sequence:0},{device_id:id()},{created_at:'today'}])expect(await verifySecurityEvent(f.publicKey,{...f.first,...patch})).toBe(false);
});
