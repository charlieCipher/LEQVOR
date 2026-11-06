import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {importJWK,jwtVerify} from 'jose';
import {createKmsAuthorizationSigner} from './kms-authorization-signer.mjs';
test('KMS adapter pins public SPKI and immutable key ARN, verifies DER signatures and produces valid ES256 authorization JWTs',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),pin=createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('hex');
 const arn='arn:aws:kms:ap-southeast-2:533047842985:key/00000000-0000-4000-8000-000000000001',header={alg:'ES256',typ:'leqvor-control-access+jwt'},payload={iss:'https://authorization.example/',aud:'https://control.example',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+30};
 const input=Buffer.from(`${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`);let broken=false;
 class Client{async send(c){if(c.constructor.name==='GetPublicKeyCommand')return {KeyId:arn,KeyUsage:'SIGN_VERIFY',KeySpec:'ECC_NIST_P256',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:publicKey.export({format:'der',type:'spki'})};assert.equal(c.input.MessageType,'DIGEST');assert.deepEqual(c.input.Message,createHash('sha256').update(input).digest());return {KeyId:arn,SigningAlgorithm:'ECDSA_SHA_256',Signature:broken?Buffer.alloc(64):sign('sha256',input,privateKey)};}destroy(){}}
 const options={keyArn:arn,region:'ap-southeast-2',credentials:async()=>({}),publicJwk:jwk,keyPin:pin};
 const signer=await createKmsAuthorizationSigner(options,{Client});const token=await signer.signJwt(payload,header);assert.deepEqual((await jwtVerify(token,await importJWK(jwk,'ES256'),{algorithms:['ES256']})).payload,payload);
 broken=true;await assert.rejects(signer.signJwt(payload,header));await assert.rejects(signer.signJwt(payload,{alg:'ES256',typ:'other'}));signer.close();
 await assert.rejects(createKmsAuthorizationSigner({...options,keyArn:arn.replace(/key\/.*$/,'alias/unsafe')},{Client}));
 await assert.rejects(createKmsAuthorizationSigner({...options,keyPin:'a'.repeat(64)},{Client}));
});
