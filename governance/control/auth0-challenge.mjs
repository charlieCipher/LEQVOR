// PREPARED ONLY: first of two separate Post Login Actions. Auth0 resumes in
// the following Action after challengeWithAny completes. Never set MFA claims
// merely because a challenge was requested or a factor is enrolled.
export async function onExecutePostLogin(event,api){
 if(event.resource_server?.identifier!=='leqvor-control-console')return;
 const deny=()=>api.access.deny('Fresh interactive control authentication and enrolled MFA are required.');
 if(!event.secrets?.LEQVOR_CONTROL_CLIENT_ID||event.client?.client_id!==event.secrets.LEQVOR_CONTROL_CLIENT_ID||event.transaction?.protocol!=='oidc-basic-profile'||event.refresh_token||event.user?.blocked)return deny();
 const now=Date.now(),methods=event.authentication?.methods;
 if(!Array.isArray(methods)||!methods.some(m=>['pwd','passkey'].includes(m.name)&&typeof m.timestamp==='string'&&Number.isFinite(Date.parse(m.timestamp))&&Date.parse(m.timestamp)<=now&&Date.parse(m.timestamp)>=now-300000))return deny();
 if(!Array.isArray(event.user?.enrolledFactors))return deny();
 const factors=['webauthn-roaming','otp'].filter(type=>event.user.enrolledFactors.some(f=>f.type===type)).map(type=>({type}));
 if(!factors.length)return deny();
 // Do not request an unavailable enterprise WebAuthn factor for OTP-only users.
 api.authentication.challengeWithAny(factors);
}
