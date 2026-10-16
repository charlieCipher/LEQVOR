import {createClient} from '@supabase/supabase-js';
import {serverBackend} from './deployment-environment.mjs';
import {backendTransport} from './backend-fetch.mjs';
import {verifyDeviceChallenge} from '../src/modules/sessions/deviceProof.js';
import {securityEventCommitment,verifySecurityEvent} from '../src/modules/security/securityEventSignatures.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export async function verifiedDevice({method,authorization,body,env,clientFactory=createClient,now=Date.now()}){
 const unavailable={status:404,body:{error:'Device verification unavailable.'}},timedOut={status:503,body:{error:'Device service unavailable.'}};
 if(method!=='POST')return {status:405,body:{error:'Method not allowed.'}};
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return {status:401,body:{error:'Authentication required.'}};
 const revoking=body?.operation==='revoke';
 if(!body||Object.keys(body).some(k=>!(revoking?['operation','device_id','event']:['challenge_id','signature','event']).includes(k))||(!revoking&&(!uuid(body.challenge_id)||typeof body.signature!=='string'||body.signature.length!==88))||(revoking&&!uuid(body.device_id)))return {status:400,body:{error:'Invalid device proof.'}};
 try{securityEventCommitment(body.event);}catch{return {status:400,body:{error:'Invalid device event.'}};}
 const project=serverBackend(env);
 const publicKey=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 if(!project||env.SUPABASE_URL!==project||!publicKey||!env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY===publicKey||env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_'))return timedOut;
 const transport=backendTransport(project),deadline=transport.signal;
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport.fetch}},token=authorization.slice(7);
  const caller=clientFactory(project,publicKey,{...options,global:{...options.global,headers:{Authorization:authorization}}});
  const authenticated=await caller.auth.getUser(token);if(deadline.aborted)return timedOut;
  if(authenticated.error||!authenticated.data?.user?.id)return {status:401,body:{error:'Authentication required.'}};
  const user=authenticated.data.user.id,parts=token.split('.');if(parts.length!==3)return unavailable;
  // Interpret claims only after authenticating this exact token at the fixed project.
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(claims.sub!==user||claims.iss!==`${project}/auth/v1`||claims.aud!=='authenticated'||claims.role!=='authenticated'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||!['aal1','aal2'].includes(claims.aal)||!uuid(claims.session_id)||!Array.isArray(claims.amr))return unavailable;
  const amr=claims.amr.filter(m=>['password','totp'].includes(m?.method)&&Number.isSafeInteger(m.timestamp)&&m.timestamp*1000>=now-300000&&m.timestamp*1000<=now+30000).map(m=>({method:m.method,timestamp:m.timestamp}));
  if(!amr.some(m=>m.method==='password'))return {status:403,body:{error:'Recent account authentication required.'}};
  const event=body.event;
  if(event.owner_id!==user||Date.parse(event.created_at)<now-300000||Date.parse(event.created_at)>now+30000)return unavailable;
  const identity=await caller.from('review_signing_keys').select('*').eq('id',event.signing_key_id).maybeSingle();if(deadline.aborted)return timedOut;
  if(identity.error||identity.data?.owner_id!==user||!await verifySecurityEvent(identity.data.public_key,event))return unavailable;
  let challenge;
  if(revoking){if(event.event_type!=='DEVICE_REVOKED'||event.device_id!==body.device_id)return unavailable;}
  else{
   const read=await caller.from('device_challenges').select('*').eq('id',body.challenge_id).maybeSingle();if(deadline.aborted)return timedOut;
   challenge=read.data;
   if(read.error||challenge?.id!==body.challenge_id||challenge?.owner_id!==user||challenge?.session_id!==claims.session_id||Date.parse(challenge.expires_at)<=now||event.device_id!==challenge.device_id||event.event_type!==(challenge.purpose==='enroll'?'DEVICE_ENROLLED':'DEVICE_PROOF_VERIFIED')||!await verifyDeviceChallenge(challenge,body.signature))return unavailable;
  }
  if(deadline.aborted)return timedOut;
  const writer=clientFactory(project,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const context={verified_user:user,verified_amr:amr,verified_aal:claims.aal,event_data:event,expected_signer:identity.data.public_key};
  const result=await writer.rpc(revoking?'revoke_verified_v5_device':'complete_verified_v5_device',revoking?{...context,target_device:body.device_id}:{...context,verified_session:claims.session_id,expected_challenge:challenge});
  if(deadline.aborted)return timedOut;
  if(result.error?.code==='PT409')return {status:409,body:{error:'Device challenge expired or changed. Verify again.'}};
  if(result.error||result.data!==(revoking?body.device_id:challenge.device_id))return unavailable;
  return {status:200,body:{verified:true,device_id:result.data}};
 }catch{return deadline.aborted?timedOut:unavailable;}
}
