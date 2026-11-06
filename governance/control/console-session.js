import {createPkceSession} from './pkce-session.js';
import {createControlClient} from './console-client.js';
import {mountControlConsole} from './console-view.js';

// Hosting must supply independently reviewed PUBLIC pins. No credential/policy
// discovery from the governance DB, automatic enrollment or founder-role grant.
export async function mountAuthenticatedConsole({root,config,window}){
 const session=createPkceSession({...config,storage:window.sessionStorage,location:window.location,history:window.history,crypto:window.crypto,fetchImpl:window.fetch.bind(window)});
 let destroyView=null;
 if(window.location.pathname==='/auth/callback')await session.completeCallback();
 const doc=root.ownerDocument,signIn=doc.createElement('button'),signOut=doc.createElement('button'),message=doc.createElement('p'),view=doc.createElement('section');
 signIn.type=signOut.type='button';signIn.textContent='Sign in with MFA';signOut.textContent='Sign out';message.setAttribute('role','status');
 // Remove the console's background-clear hook BEFORE creating the OAuth
 // transaction, otherwise leaving for Auth0 would erase the PKCE verifier.
 signIn.addEventListener('click',()=>{destroyView?.();destroyView=null;session.login().catch(()=>{message.textContent='Authentication could not start.';});});
 signOut.addEventListener('click',()=>{destroyView?.();session.logout();});
 root.replaceChildren(signIn,signOut,message,view);
 if(config.origin==='http://127.0.0.1:8787'){
  const check=doc.createElement('button');check.type='button';check.textContent='Check signed login (no governance access)';
  check.addEventListener('click',async()=>{
   try{const token=await session.getAccessToken(),response=await window.fetch('/authentication-check',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:`Bearer ${token}`}}),result=await response.json();message.textContent=response.ok&&result.signature_and_mfa_valid===true&&result.governance_access===false?'Auth0 signature, audience, expiry and MFA proof verified. Governance access remains denied.':'Signed login check failed.';}catch{message.textContent='Sign in with MFA before checking.';}
  });root.insertBefore(check,view);
 }
 if(config.policyPin&&config.checkpoint){
  const client=createControlClient({origin:config.origin,pageOrigin:window.location.origin,policyPin:config.policyPin,checkpoint:config.checkpoint,session,fetchImpl:window.fetch.bind(window)});
  destroyView=mountControlConsole(view,client);
 }else message.textContent='Founder Authority is inactive. Independently verified policy and checkpoint are not configured. Sign-in does not grant governance access.';
 return ()=>{destroyView?.();session.clear();root.replaceChildren();};
}
