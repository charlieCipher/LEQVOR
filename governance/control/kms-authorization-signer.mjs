import {createHash,createPublicKey,verify} from 'node:crypto';
import {KMSClient,GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {publicKeyPin} from './config.mjs';

function rawSignature(der){
 const b=Buffer.from(der);let cursor=2;
 if(b.length<8||b[0]!==0x30||b[1]!==b.length-2)throw new Error('Invalid KMS signature.');
 const parts=[];
 for(let i=0;i<2;i++){
  if(b[cursor++]!==2)throw new Error('Invalid KMS signature.');const size=b[cursor++];
  if(!size||size>33||cursor+size>b.length)throw new Error('Invalid KMS signature.');let part=b.subarray(cursor,cursor+size);cursor+=size;
  if(part[0]&0x80||size>1&&part[0]===0&&!(part[1]&0x80))throw new Error('Invalid KMS signature.');
  if(part.length===33){if(part[0]!==0)throw new Error('Invalid KMS signature.');part=part.subarray(1);}
  const padded=Buffer.alloc(32);part.copy(padded,32-part.length);parts.push(padded);
 }
 if(cursor!==b.length)throw new Error('Invalid KMS signature.');return Buffer.concat(parts);
}
// Run only with the independent authorization operator's temporary KMS identity.
// No founder private key, PEM, alias-based mutable pin or local signer fallback.
export async function createKmsAuthorizationSigner({keyArn,region,credentials,publicJwk,keyPin},{Client=KMSClient}={}){
 if(typeof keyArn!=='string'||!/^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]{36}$/.test(keyArn)||keyArn.split(':')[3]!==region||typeof credentials!=='function')throw new Error('Pinned independent KMS signing identity required.');
 const expected=publicKeyPin(publicJwk,keyPin),client=new Client({region,credentials,maxAttempts:1});
 try{
  const response=await client.send(new GetPublicKeyCommand({KeyId:keyArn}),{abortSignal:AbortSignal.timeout(2000)});
  if(response.KeyId!==keyArn||response.KeyUsage!=='SIGN_VERIFY'||response.KeySpec!=='ECC_NIST_P256'||!response.SigningAlgorithms?.includes('ECDSA_SHA_256'))throw new Error();
  const key=createPublicKey({key:Buffer.from(response.PublicKey),format:'der',type:'spki'}),jwk=key.export({format:'jwk'});
  publicKeyPin(jwk,keyPin); // Pin compares canonical coordinates, not JSON order.
  if(jwk.x!==expected.x||jwk.y!==expected.y)throw new Error();
  return {async signJwt(payload,header){
   if(header.alg!=='ES256'||header.typ!=='leqvor-control-access+jwt'||Object.keys(header).length!==2)throw new Error('Authorization signing domain required.');
   const input=Buffer.from(`${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`);
   const signed=await client.send(new SignCommand({KeyId:keyArn,Message:createHash('sha256').update(input).digest(),MessageType:'DIGEST',SigningAlgorithm:'ECDSA_SHA_256'}),{abortSignal:AbortSignal.timeout(2000)});
   if(signed.KeyId!==keyArn||signed.SigningAlgorithm!=='ECDSA_SHA_256'||!signed.Signature||!verify('sha256',input,key,Buffer.from(signed.Signature)))throw new Error('KMS authorization signature rejected.');
   return `${input.toString()}.${rawSignature(signed.Signature).toString('base64url')}`;
  },close:()=>client.destroy()};
 }catch{client.destroy();throw new Error('Independent KMS signer verification failed.');}
}
