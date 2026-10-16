import {createRemoteJWKSet,jwtVerify} from 'jose';

const audience='leqvor-control-console';
function httpsUrl(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('Pinned HTTPS identity endpoint required.');
 return url;
}

// Configure from an independently protected identity provider, never a packet,
// customer profile or JWT header. This verifies ACCESS tokens, not ID tokens.
export function createControlAuthenticator({issuer,jwksUrl,mfaAcr,isSessionActive,clock=Date.now,keyResolver}){
 httpsUrl(issuer);const endpoint=httpsUrl(jwksUrl);
 if(typeof mfaAcr!=='string'||!mfaAcr.trim()||typeof isSessionActive!=='function')throw new Error('Provider MFA mapping and live session revocation adapter required.');
 const resolve=keyResolver??createRemoteJWKSet(endpoint,{timeoutDuration:5000,cooldownDuration:30000});
 return async token=>{
  if(typeof token!=='string'||token.length>8192||!token)throw new Error('Invalid control token.');
  const now=clock();if(!Number.isSafeInteger(now))throw new Error('Invalid control clock.');
  const {payload,protectedHeader}=await jwtVerify(token,resolve,{
   issuer,audience,algorithms:['RS256','ES256'],typ:'at+jwt',
   requiredClaims:['sub','iat','exp','jti','auth_time'],
   currentDate:new Date(now),clockTolerance:0,maxTokenAge:300,
  });
  if(protectedHeader.jku||protectedHeader.jwk||protectedHeader.x5u)throw new Error('Caller-selected signing keys denied.');
  if(payload.aud!==audience||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256||
     typeof payload.jti!=='string'||!payload.jti||payload.jti.length>256||
     !Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.auth_time)||
     payload.iat*1000>now||payload.auth_time>payload.iat||payload.auth_time<0||payload.exp<=payload.iat||payload.exp-payload.iat>300)
   throw new Error('Invalid control token claims.');
  // Live revocation is mandatory and fails closed. Roles are fetched separately
  // by GovernanceGateway; a signed token role does not become root authority.
  if(await isSessionActive({issuer,subject:payload.sub,token_id:payload.jti,expires_at:payload.exp*1000})!==true)
   throw new Error('Control session revoked or unavailable.');
  const completedAt=clock();
  if(!Number.isSafeInteger(completedAt)||completedAt<now||payload.exp*1000<=completedAt)
   throw new Error('Control session expired or clock invalid.');
  return {id:payload.sub,audience,expires_at:payload.exp*1000,authenticated_at:payload.auth_time*1000,mfa_verified:payload.acr===mfaAcr};
 };
}
