// @vitest-environment node
import {it,expect} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {parseWindowsEvidence,verifyWindowsCertify} from '../governance/attestation/windows-evidence.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest();
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const sized=b=>Buffer.concat([u16(b.length),b]);
function fixture(digest='sha256'){
 const key=generateKeyPairSync('rsa',{modulusLength:2048}),aik=generateKeyPairSync('rsa',{modulusLength:2048}),jwk=key.publicKey.export({format:'jwk'}),spki=key.publicKey.export({format:'der',type:'spki'});
 const tpmt=Buffer.concat([u16(1),u16(0xb),u32(0x40032),sized(Buffer.alloc(32)),u16(0x10),u16(0x10),u16(2048),u32(0),sized(Buffer.from(jwk.n,'base64url'))]);
 const name=Buffer.concat([u16(0xb),sha(tpmt)]),certify=Buffer.concat([u32(0xff544347),u16(0x8017),sized(name),sized(Buffer.alloc(0)),Buffer.alloc(16),Buffer.from([1]),Buffer.alloc(8),sized(name),sized(name)]),signature=sign(digest,certify,aik.privateKey);
 const publicArea=sized(tpmt),pcp=Buffer.alloc(56+publicArea.length+32);Buffer.from('PCPM').copy(pcp);pcp.writeUInt32LE(56,4);pcp.writeUInt32LE(2,8);pcp.writeUInt32LE(10,12);pcp.writeUInt32LE(publicArea.length,16);publicArea.copy(pcp,56);
 const inner=Buffer.alloc(24);Buffer.from('KADS').copy(inner);[2,24,certify.length,signature.length,pcp.length].forEach((n,i)=>inner.writeUInt32LE(n,(i+1)*4));
 const body=Buffer.concat([inner,certify,signature,pcp]),outer=Buffer.alloc(28);Buffer.from('KAST').copy(outer);[1,2,28,0,body.length,0].forEach((n,i)=>outer.writeUInt32LE(n,(i+1)*4));
 const evidence={domain:'leqvor-founder-device-evidence-v1',credential:{slot:'A',algorithm:'RS256',spki:spki.toString('base64'),key_id:sha(spki).toString('hex')},attestation:Buffer.concat([outer,body]).toString('base64'),certificate_chain:'AQ==',independently_verified:false};
 return {evidence,aik};
}
it('binds TPM-certified RSA public name to the retained SPKI and verifies a SHA-256 AIK signature',()=>{const f=fixture(),p=parseWindowsEvidence(f.evidence);expect(verifyWindowsCertify(p,f.aik.publicKey)).toEqual({algorithm:'sha256',policy_accepted:true});expect(p.extraData.length).toBe(0);});
it('identifies legacy SHA-1 only in diagnostic mode and never approves it under the strict policy',()=>{const f=fixture('sha1'),p=parseWindowsEvidence(f.evidence);expect(()=>verifyWindowsCertify(p,f.aik.publicKey)).toThrow();expect(verifyWindowsCertify(p,f.aik.publicKey,{diagnosticOnly:true})).toEqual({algorithm:'sha1',policy_accepted:false});});
it('rejects signature/key substitution and modified signed bytes',()=>{const f=fixture(),p=parseWindowsEvidence(f.evidence);expect(()=>verifyWindowsCertify(p,fixture().aik.publicKey)).toThrow();const signature=Buffer.from(p.signature);signature[0]^=1;expect(()=>verifyWindowsCertify({...p,signature},f.aik.publicKey)).toThrow();const certify=Buffer.from(p.certify);certify[20]^=1;expect(()=>verifyWindowsCertify({...p,certify},f.aik.publicKey,{diagnosticOnly:true})).toThrow();});
it('rejects malformed lengths, unknown formats, trailing data and unauthentic public-key binding',()=>{const f=fixture();for(const position of [0,4,8,12,20,28,32,36,40,44,48]){const raw=Buffer.from(f.evidence.attestation,'base64');raw[position]^=0xff;expect(()=>parseWindowsEvidence({...f.evidence,attestation:raw.toString('base64')})).toThrow();}expect(()=>parseWindowsEvidence({...f.evidence,credential:fixture().evidence.credential})).toThrow();expect(()=>parseWindowsEvidence({...f.evidence,independently_verified:true})).toThrow();expect(()=>parseWindowsEvidence({...f.evidence,attestation:f.evidence.attestation+'\n'})).toThrow();});
