import {createControlAuthenticator} from './auth.mjs';
import {httpsEndpoint} from './config.mjs';

export const auth0MfaClaim='https://leqvor.vercel.app/control-authentication';
export function createAuth0Authenticator({issuer,clientId,isSessionActive,clock=Date.now,keyResolver}){
 const u=httpsEndpoint(issuer);
 if(u.pathname!=='/'||!issuer.endsWith('/')||typeof clientId!=='string'||!clientId)throw new Error('Pinned Auth0 tenant and control client required.');
 return createControlAuthenticator({issuer,jwksUrl:`${issuer}.well-known/jwks.json`,mfaAcr:'unused-provider-mapping',isSessionActive,clock,keyResolver,
  providerClaims:payload=>{
   const proof=payload[auth0MfaClaim];
   if(payload.client_id!==clientId||typeof payload.sub!=='string'||payload.sub.endsWith('@clients')||payload.act||payload.sub_profile&&payload.sub_profile!=='user'||!proof||Object.keys(proof).sort().join(',')!=='authenticated_at,mfa'||proof.mfa!==true||!Number.isSafeInteger(proof.authenticated_at))throw new Error('Verified Auth0 end-user MFA required.');
   return {authenticated_at:proof.authenticated_at,mfa_verified:true};
  },includeSession:true});
}
