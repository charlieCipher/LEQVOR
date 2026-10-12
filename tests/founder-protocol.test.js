// @vitest-environment node
import {it,expect} from 'vitest';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {inspectFounderRequest,founderPublicKeyFingerprint,verifyFounderApproval} from '../scripts/founder-protocol.mjs';
const now=Date.parse('2026-10-12T12:00:00.000Z');
function fixture(){
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=pair.publicKey.export({format:'jwk'});
 const request={domain:'leqvor-founder-governance-v1',platform:'leqvor.vercel.app',action:'TRANSFER_PLATFORM_CONTROL',target:randomUUID(),request_id:randomUUID(),nonce:'a'.repeat(64),governance_version:42,key_id:founderPublicKeyFingerprint(publicKey),phase:'PROPOSE',proposal_hash:null,issued_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString()};
 const signature=sign('sha256',inspectFounderRequest(request,now).bytes,{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
 return {pair,publicKey,request,signature};
}
it('verifies exact domain-bound bytes against an independent public pin',()=>{
 const f=fixture();expect(verifyFounderApproval(f,f.publicKey,now)).toBe(true);
 expect(verifyFounderApproval(f,fixture().publicKey,now)).toBe(false);
 const reversed=Object.fromEntries(Object.entries(f.request).reverse());expect(inspectFounderRequest(reversed,now).digest).toBe(inspectFounderRequest(f.request,now).digest);
});
it('rejects target, action, phase, version, platform and nonce substitution',()=>{
 const f=fixture();for(const delta of [{target:randomUUID()},{action:'REMOVE_FOUNDER'},{phase:'CONFIRM',proposal_hash:'b'.repeat(64)},{governance_version:43},{platform:'preview.vercel.app'},{nonce:'c'.repeat(64)},{request_id:randomUUID()}])expect(verifyFounderApproval({...f,request:{...f.request,...delta}},f.publicKey,now)).toBe(false);
});
it('rejects expired, future, excessive-duration and noncanonical dates',()=>{
 const f=fixture();expect(verifyFounderApproval(f,f.publicKey,now+600000)).toBe(false);
 for(const delta of [{issued_at:new Date(now+60000).toISOString()},{expires_at:new Date(now+600001).toISOString()},{issued_at:'2026-10-12T12:00:00Z'}])expect(()=>inspectFounderRequest({...f.request,...delta},now)).toThrow();
});
it('refuses private-key input, extra fields and unbound confirmations',()=>{
 const f=fixture();expect(()=>founderPublicKeyFingerprint(f.pair.privateKey.export({format:'jwk'}))).toThrow();
 for(const delta of [{approved:true},{phase:'CONFIRM'},{phase:'PROPOSE',proposal_hash:'a'.repeat(64)},{target:'Account XYZ'},{key_id:'wrong'}])expect(()=>inspectFounderRequest({...f.request,...delta},now)).toThrow();
});
