import {createHash,createPublicKey,verify,constants} from 'node:crypto';
import {exact,hash,publicCredential} from '../protocol.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest();
function requireValue(ok){if(!ok)throw new Error('Windows TPM evidence binding rejected.');}
function reader(bytes){let offset=0;return {take(n){requireValue(Number.isInteger(n)&&n>=0&&offset+n<=bytes.length);const value=bytes.subarray(offset,offset+n);offset+=n;return value;},u16(){return this.take(2).readUInt16BE();},u32(){return this.take(4).readUInt32BE();},sized(){return this.take(this.u16());},done(){requireValue(offset===bytes.length);}};}
export function publicBytes(value,max=65536){requireValue(typeof value==='string'&&value.length<=max*2);const raw=Buffer.from(value,'base64');requireValue(raw.length>0&&raw.length<=max&&raw.toString('base64')===value);return raw;}
// Bounded decoding of Microsoft KAST/KADS/PCP and TCG TPM 2.0 wire
// structures. Cryptographic operations use Node/OpenSSL standard primitives.
// No OS key, TPM device or private material is opened by this module.
export function parseWindowsEvidence(evidence){
 exact(evidence,['domain','credential','attestation','certificate_chain','independently_verified']);requireValue(evidence.domain==='leqvor-founder-device-evidence-v1'&&evidence.independently_verified===false&&evidence.credential.slot==='A'&&evidence.credential.algorithm==='RS256');
 const expected=publicCredential(evidence.credential),blob=publicBytes(evidence.attestation),chain=publicBytes(evidence.certificate_chain);
 requireValue(blob.length>=28&&blob.subarray(0,4).toString('ascii')==='KAST'&&blob.readUInt32LE(4)===1&&blob.readUInt32LE(8)===2&&blob.readUInt32LE(12)===28&&blob.readUInt32LE(16)===0&&blob.readUInt32LE(24)===0&&blob.readUInt32LE(20)===blob.length-28);
 const inner=blob.subarray(28);requireValue(inner.length>=24&&inner.subarray(0,4).toString('ascii')==='KADS'&&inner.readUInt32LE(4)===2&&inner.readUInt32LE(8)===24);
 const lengths=[inner.readUInt32LE(12),inner.readUInt32LE(16),inner.readUInt32LE(20)];requireValue(lengths.every(n=>n>0)&&24+lengths.reduce((a,b)=>a+b,0)===inner.length);
 const certify=inner.subarray(24,24+lengths[0]),signature=inner.subarray(24+lengths[0],24+lengths[0]+lengths[1]),pcp=inner.subarray(24+lengths[0]+lengths[1]);
 requireValue(pcp.length>=56&&pcp.subarray(0,4).toString('ascii')==='PCPM'&&pcp.readUInt32LE(4)===56&&pcp.readUInt32LE(8)===2);
 // This public-evidence reader deliberately supports only the observed public
 // PCP form: no private/migration/secret/PCR material. Tail is a SHA-256 digest.
 requireValue(Array.from({length:9},(_,i)=>pcp.readUInt32LE(20+i*4)).every(n=>n===0));
 const publicLength=pcp.readUInt32LE(16);requireValue(publicLength>=2&&56+publicLength+32===pcp.length);
 const pub=pcp.subarray(56,56+publicLength),pr=reader(pub);const tpmt=pr.take(pr.u16());pr.done();const p=reader(tpmt);
 requireValue(p.u16()===1&&p.u16()===0x000b);const attributes=p.u32(),authPolicy=p.sized();requireValue(authPolicy.length===32&&(attributes&0x32)===0x32&&(attributes&0x40000)!==0);
 const sym=p.u16();requireValue(sym===0x0010);const scheme=p.u16();requireValue(scheme===0x0010||(scheme===0x0014&&p.u16()===0x000b));
 const keyBits=p.u16(),exponent=p.u32()||65537,modulus=p.sized();p.done();requireValue(keyBits>=2048&&keyBits<=4096&&modulus.length*8===keyBits&&exponent===65537);
 const key=createPublicKey({key:{kty:'RSA',n:modulus.toString('base64url'),e:'AQAB'},format:'jwk'});
 requireValue(key.export({type:'spki',format:'der'}).equals(expected.export({type:'spki',format:'der'})));
 const a=reader(certify);requireValue(a.u32()===0xff544347&&a.u16()===0x8017);const signer=a.sized(),extraData=a.sized();requireValue(signer.length===34&&signer.readUInt16BE()===0x000b&&extraData.length<=64);a.take(16);const safe=a.take(1)[0];requireValue(safe===1);a.take(8);const name=a.sized(),qualifiedName=a.sized();a.done();
 requireValue(name.equals(Buffer.concat([Buffer.from([0,0x0b]),digest(tpmt)]))&&qualifiedName.length===34&&qualifiedName.readUInt16BE()===0x000b);
 return {certify,signature,chain,attributes,extraData,public_key_id:evidence.credential.key_id,evidence_hash:hash(evidence)};
}
export function verifyWindowsCertify(parsed,aikPublicKey,{diagnosticOnly=false}={}){
 requireValue(aikPublicKey.asymmetricKeyType==='rsa'&&aikPublicKey.asymmetricKeyDetails?.modulusLength>=2048);
 const options={key:aikPublicKey,padding:constants.RSA_PKCS1_PADDING};
 if(verify('sha256',parsed.certify,options,parsed.signature))return {algorithm:'sha256',policy_accepted:true};
 // Diagnostic identification of the legacy signature is NOT authorization.
 // The strict entry point rejects it; no root enrollment trusts this result.
 if(diagnosticOnly&&verify('sha1',parsed.certify,options,parsed.signature))return {algorithm:'sha1',policy_accepted:false};
 throw new Error('Windows TPM attestation signature rejected by SHA-256 policy.');
}
