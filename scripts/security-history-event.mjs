import {createClient} from '@supabase/supabase-js';
import {securityEventCommitment,verifySecurityEvent} from '../src/modules/security/securityEventSignatures.js';
const project='https://awdsyhxdnyfilnzamflt.supabase.co';
export async function securityHistoryEvent({method,authorization,body,env,clientFactory=createClient,now=Date.now()}){
 const unavailable={status:404,body:{error:'Security history unavailable.'}};
 if(method!=='POST')return {status:405,body:{error:'Method not allowed.'}};
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return {status:401,body:{error:'Authentication required.'}};
 try{securityEventCommitment(body);}catch{return {status:400,body:{error:'Invalid security event.'}};}
 const publicKey=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 if(env.SUPABASE_URL!==project||!publicKey||!env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY===publicKey||env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_'))return {status:503,body:{error:'Security history service unavailable.'}};
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},token=authorization.slice(7);
  const caller=clientFactory(project,publicKey,{...options,global:{headers:{Authorization:authorization}}});
  const authenticated=await caller.auth.getUser(token);
  if(authenticated.error||!authenticated.data?.user?.id)return {status:401,body:{error:'Authentication required.'}};
  const user=authenticated.data.user.id,parts=token.split('.');if(parts.length!==3)return {status:401,body:{error:'Authentication required.'}};
  // Claims are read only after authenticating this exact token with the fixed project.
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(claims.sub!==user||claims.iss!==`${project}/auth/v1`||claims.aud!=='authenticated'||claims.role!=='authenticated'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||!['aal1','aal2'].includes(claims.aal)||!Array.isArray(claims.amr)||body.owner_id!==user)return {status:401,body:{error:'Authentication required.'}};
  const amr=claims.amr.filter(m=>['password','totp'].includes(m?.method)&&Number.isSafeInteger(m.timestamp)&&m.timestamp*1000>=now-300000&&m.timestamp*1000<=now+30000).map(m=>({method:m.method,timestamp:m.timestamp}));
  if(!amr.some(m=>m.method==='password'))return {status:403,body:{error:'Recent authentication required.'}};
  if(Date.parse(body.created_at)<now-300000||Date.parse(body.created_at)>now+30000)return unavailable;
  const read=await caller.from('review_signing_keys').select('*').eq('id',body.signing_key_id).maybeSingle();
  if(read.error||read.data?.owner_id!==user||!await verifySecurityEvent(read.data.public_key,body))return unavailable;
  const writer=clientFactory(project,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const written=await writer.rpc('append_verified_v5_security_event',{verified_user:user,verified_amr:amr,verified_aal:claims.aal,event_data:body,expected_signer:read.data.public_key});
  if(written.error?.code==='40001')return {status:409,body:{error:'Security history changed. Verify the latest checkpoint before retrying.'}};
  if(written.error)return unavailable;
  return {status:200,body:{recorded:true}};
 }catch{return unavailable;}
}
