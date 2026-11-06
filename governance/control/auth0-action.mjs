// PREPARED ONLY. Review/copy the exported function into an Auth0 Post Login
// Action as exports.onExecutePostLogin. Configure the control API separately.
// This does not grant a control role or enroll founder credentials.
export async function onExecutePostLogin(event,api){
 if(event.resource_server?.identifier!=='leqvor-control-console')return;
 const deny=()=>api.access.deny('Fresh interactive control authentication with MFA is required.');
 if(!event.secrets?.LEQVOR_CONTROL_CLIENT_ID||event.client?.client_id!==event.secrets.LEQVOR_CONTROL_CLIENT_ID||event.transaction?.protocol!=='oidc-basic-profile'||event.refresh_token||event.user?.blocked)return deny();
 const now=Date.now(),methods=event.authentication?.methods;
 if(!Array.isArray(methods))return deny();
 const recent=method=>method&&typeof method.timestamp==='string'&&Number.isFinite(Date.parse(method.timestamp))&&Date.parse(method.timestamp)<=now&&Date.parse(method.timestamp)>=now-300000;
 const primary=methods.filter(m=>['pwd','passkey'].includes(m.name)&&recent(m));
 const mfa=methods.filter(m=>m.name==='mfa'&&['otp','webauthn-roaming'].includes(m.type)&&recent(m));
 if(!primary.length||!mfa.length)return deny();
 const authenticatedAt=Math.floor(Math.min(Math.max(...primary.map(m=>Date.parse(m.timestamp))),Math.max(...mfa.map(m=>Date.parse(m.timestamp))))/1000);
 api.accessToken.setCustomClaim('https://leqvor.vercel.app/control-authentication',{authenticated_at:authenticatedAt,mfa:true});
}
