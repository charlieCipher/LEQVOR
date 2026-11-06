import {importJWK,jwtVerify} from 'jose';
import {randomBytes} from 'node:crypto';
import {httpsEndpoint} from './config.mjs';

const roles=new Set(['FOUNDER','SECURITY_ADMIN','OPERATIONS_ADMIN','SUPPORT_ADMIN','BILLING_ADMIN','AUDITOR']);
// An independent access operator signs fresh nonce-bound session decisions.
// Fetch on every check: no replayed allowlist, token roles or default founder.
export async function createAccessRegistry({url,key,issuer,identityIssuer,controlOrigin,readToken,clock=Date.now,fetchImpl=fetch}){
 httpsEndpoint(url);httpsEndpoint(issuer);httpsEndpoint(identityIssuer);const publicKey=await importJWK(key,'ES256');
 if(typeof readToken!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(readToken))throw new Error('Scoped registry credential required.');
 async function lookup({issuer:tokenIssuer,subject,token_id,expires_at}){
  if(tokenIssuer!==identityIssuer)throw new Error('Access identity issuer mismatch.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{
   const nonce=randomBytes(32).toString('hex');
   const response=await fetchImpl(url,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Accept:'application/jwt','Content-Type':'application/json',Authorization:`Bearer ${readToken}`},body:JSON.stringify({nonce,identity_issuer:identityIssuer,subject,token_id,expires_at})});
   if(response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='application/jwt')throw new Error('Access registry unavailable.');
   const reader=response.body.getReader();const chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw new Error('Access registry oversized.');chunks.push(value);}}finally{await reader.cancel();}
   const token=Buffer.concat(chunks).toString('utf8'),now=clock();
   if(!Number.isSafeInteger(now))throw new Error('Invalid access clock.');
   const {payload,protectedHeader}=await jwtVerify(token,publicKey,{algorithms:['ES256'],typ:'leqvor-control-access+jwt',issuer,audience:controlOrigin,requiredClaims:['iat','exp','jti','grants'],currentDate:new Date(now),clockTolerance:0,maxTokenAge:60});
   if(protectedHeader.jwk||protectedHeader.jku||protectedHeader.x5u||payload.nonce!==nonce||payload.aud!==controlOrigin||payload.identity_issuer!==identityIssuer||issuer===identityIssuer||!Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp)||payload.iat*1000>now||payload.exp<=payload.iat||payload.exp-payload.iat>60||typeof payload.jti!=='string'||!payload.jti||payload.jti.length>256||!Array.isArray(payload.grants)||payload.grants.length>128)throw new Error('Invalid access registry.');
   const matches=payload.grants.filter(g=>g?.subject===subject&&g?.token_id===token_id);
   if(matches.length!==1)throw new Error('Control session not authorized.');
   const grant=matches[0];
   const completedAt=clock();
   if(Object.keys(grant).sort().join(',')!=='expires_at,role,subject,token_id'||!roles.has(grant.role)||!Number.isSafeInteger(grant.expires_at)||grant.expires_at!==expires_at||!Number.isSafeInteger(completedAt)||grant.expires_at<=completedAt||payload.exp*1000<=completedAt||completedAt<now)throw new Error('Control grant invalid or expired.');
   return grant.role;
  }finally{clearTimeout(timer);}
 }
 return Object.freeze({isSessionActive:async binding=>{await lookup(binding);return true;},lookupRole:async(subject,principal)=>{
  if(subject!==principal?.id||!principal?.session)throw new Error('Verified session binding required.');
  return lookup(principal.session);
 }});
}
