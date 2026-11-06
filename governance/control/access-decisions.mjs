import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {importJWK,jwtVerify} from 'jose';
import {exact,hash} from '../protocol.mjs';
import {httpsEndpoint,publicKeyPin} from './config.mjs';

const roles=new Set(['FOUNDER','SECURITY_ADMIN','OPERATIONS_ADMIN','SUPPORT_ADMIN','BILLING_ADMIN','AUDITOR']);
// Producer core for a SEPARATELY OPERATED authorization service, not an endpoint
// on the control service. No listener, directory bootstrap, role assignment,
// private signing key, persistence default or production deployment is provided.
// lookupLiveBinding must atomically read the authoritative role AND revocation
// state; an Auth0 JWT role, logout result or cached allowlist is not that source.
export async function createAccessDecisionIssuer({identityIssuer,issuer,controlOrigin,readerTokenSha256,publicJwk,keyPin,lookupLiveBinding,signJwt,clock=Date.now}){
 httpsEndpoint(identityIssuer);httpsEndpoint(issuer);httpsEndpoint(controlOrigin,{originOnly:true});
 if(issuer===identityIssuer||new URL(issuer).origin===controlOrigin||!/^[a-f0-9]{64}$/.test(readerTokenSha256)||typeof lookupLiveBinding!=='function'||typeof signJwt!=='function')throw new Error('Independent authorization adapters required.');
 const key=await importJWK(publicKeyPin(publicJwk,keyPin),'ES256');
 const credentialHash=Buffer.from(readerTokenSha256,'hex');
 return async(readerToken,input)=>{
  if(typeof readerToken!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(readerToken)||!timingSafeEqual(createHash('sha256').update(readerToken).digest(),credentialHash))throw new Error('Authorization reader denied.');
  input=structuredClone(input);exact(input,['nonce','identity_issuer','subject','token_id','expires_at']);
  const started=clock();
  if(!Number.isSafeInteger(started)||input.identity_issuer!==identityIssuer||typeof input.nonce!=='string'||!/^[a-f0-9]{64}$/.test(input.nonce)||typeof input.subject!=='string'||!input.subject||input.subject.length>256||typeof input.token_id!=='string'||!input.token_id||input.token_id.length>256||!Number.isSafeInteger(input.expires_at)||input.expires_at<=started||input.expires_at>started+300000)throw new Error('Invalid authorization binding.');
  const {nonce,...binding}=input;
  function record(value){
   const copy=structuredClone(value);exact(copy,['identity_issuer','subject','token_id','expires_at','active','role','revision']);
   if(copy.identity_issuer!==identityIssuer||copy.subject!==input.subject||copy.token_id!==input.token_id||copy.expires_at!==input.expires_at||copy.active!==true||!roles.has(copy.role)||typeof copy.revision!=='string'||!copy.revision||copy.revision.length>128)throw new Error('Session revoked or role unavailable.');
   return copy;
  }
  const before=record(await lookupLiveBinding(structuredClone(binding))),issued=clock();
  if(!Number.isSafeInteger(issued)||issued<started||issued-started>=4000||input.expires_at<=issued)throw new Error('Authorization lookup expired.');
  const iat=Math.floor(issued/1000),exp=Math.min(iat+30,Math.floor(input.expires_at/1000));
  if(exp<=iat)throw new Error('Session expires before authorization.');
  const payload={iss:issuer,aud:controlOrigin,identity_issuer:identityIssuer,iat,exp,jti:randomUUID(),nonce,
   grants:[{subject:input.subject,token_id:input.token_id,expires_at:input.expires_at,role:before.role}]};
  const token=await signJwt(structuredClone(payload),{alg:'ES256',typ:'leqvor-control-access+jwt'});
  if(typeof token!=='string'||token.length>65536)throw new Error('Invalid independent signature response.');
  const after=record(await lookupLiveBinding(structuredClone(binding))),completed=clock();
  if(hash(before)!==hash(after)||!Number.isSafeInteger(completed)||completed<issued||completed-started>=4000||exp*1000<=completed||input.expires_at<=completed)throw new Error('Authorization changed while signing.');
  const verified=await jwtVerify(token,key,{issuer,audience:controlOrigin,algorithms:['ES256'],typ:'leqvor-control-access+jwt',currentDate:new Date(completed),clockTolerance:0});
  if(hash(verified.payload)!==hash(payload)||Object.keys(verified.protectedHeader).some(k=>!['alg','typ','kid'].includes(k)))throw new Error('Independent signer changed the decision.');
  return token;
 };
}
