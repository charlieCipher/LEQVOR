import {createClient} from '@supabase/supabase-js';
import {verifyReviewDecision} from '../src/modules/security/reviewSignatures.js';
const project='https://awdsyhxdnyfilnzamflt.supabase.co';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function triggerReviewDecision({method,authorization,body,env,clientFactory=createClient,now=Date.now()}){
 const unavailable={status:404,body:{error:'Review unavailable.'}};
 if(method!=='POST')return {status:405,body:{error:'Method not allowed.'}};
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return {status:401,body:{error:'Authentication required.'}};
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['request_id','outcome','signature'].includes(k))||!uuid(body.request_id)||!['APPROVED','REJECTED','NEEDS_REVIEW'].includes(body.outcome)||typeof body.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(body.signature))return {status:400,body:{error:'Invalid review decision.'}};
 const publicKey=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 if(env.SUPABASE_URL!==project||!publicKey||!env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY===publicKey||env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_'))return {status:503,body:{error:'Review service unavailable.'}};
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const token=authorization.slice(7),caller=clientFactory(project,publicKey,{...options,global:{headers:{Authorization:authorization}}});
  // Authenticate this exact token against the configured project BEFORE reading claims.
  const authenticated=await caller.auth.getUser(token);
  if(authenticated.error||!authenticated.data?.user?.id)return {status:401,body:{error:'Authentication required.'}};
  const user=authenticated.data.user.id;
  const parts=token.split('.');if(parts.length!==3)return {status:401,body:{error:'Authentication required.'}};
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(claims.sub!==user||claims.iss!==`${project}/auth/v1`||claims.aud!=='authenticated'||claims.role!=='authenticated'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||!['aal1','aal2'].includes(claims.aal)||!Array.isArray(claims.amr))return {status:401,body:{error:'Authentication required.'}};
  const amr=claims.amr.filter(m=>['password','totp'].includes(m?.method)&&Number.isSafeInteger(m.timestamp)&&m.timestamp*1000>=now-300000&&m.timestamp*1000<=now+30000).map(m=>({method:m.method,timestamp:m.timestamp}));
  if(!amr.length)return {status:403,body:{error:'Recent authentication required.'}};
  const read=await caller.from('trigger_review_requests').select('*').eq('id',body.request_id).maybeSingle();
  const request=read.data;
  if(read.error||!request||request.id!==body.request_id||request.reviewer_id!==user||request.cancelled_at||Date.parse(request.expires_at)<=now)return unavailable;
  const decision={request_id:request.id,reviewer_id:user,signing_key_id:request.signing_key_id,outcome:body.outcome,signature:body.signature};
  if(!await verifyReviewDecision(request,decision,request.signing_public_key))return unavailable;
  // Only verified decisions reach the privileged writer. SQL rechecks revocation,
  // expiration, request snapshot, current signing key, replay and MFA atomically.
  const writer=clientFactory(project,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const expected={id:request.id,owner_id:request.owner_id,vault_id:request.vault_id,rule_id:request.rule_id,grant_id:request.grant_id,reviewer_id:request.reviewer_id,record_revision:request.record_revision,expires_at:request.expires_at,signing_key_id:request.signing_key_id,signing_public_key:request.signing_public_key};
  if(request.manifest_id){expected.manifest_id=request.manifest_id;expected.manifest_hash=request.manifest_hash;}
  const written=await writer.rpc('record_verified_v5_trigger_decision',{verified_user:user,verified_amr:amr,verified_aal:claims.aal,expected_request:expected,decision:body.outcome,decision_signature:body.signature});
  if(written.error)return unavailable;
  return {status:200,body:{recorded:true}};
 }catch{return unavailable;}
}
