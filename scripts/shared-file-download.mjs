import {createClient} from '@supabase/supabase-js';
import {ciphertextEnvelope} from '../src/lib/ciphertextBoundary.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const project='https://awdsyhxdnyfilnzamflt.supabase.co';
export async function sharedFileDownload({method,authorization,body,env,clientFactory=createClient}){
 const unavailable={status:404,body:{error:'Shared file unavailable.'}};
 if(method!=='POST')return {status:405,body:{error:'Method not allowed.'}};
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return {status:401,body:{error:'Authentication required.'}};
 if(!body||Object.keys(body).some(key=>!['grant_id','file_id'].includes(key))||!uuid(body.grant_id)||!uuid(body.file_id))return {status:400,body:{error:'Invalid selected file.'}};
 const publicKey=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 if(env.SUPABASE_URL!==project||!publicKey||!env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY===publicKey||env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_'))return {status:503,body:{error:'Shared downloads unavailable.'}};
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const caller=clientFactory(project,publicKey,{...options,global:{headers:{Authorization:authorization}}});
  const authenticated=await caller.auth.getUser(authorization.slice(7));
  if(authenticated.error||!authenticated.data?.user?.id)return {status:401,body:{error:'Authentication required.'}};
  const user=authenticated.data.user.id;
  const checked=await caller.rpc('read_v5_shared_file',{target:body.grant_id,selected_file:body.file_id});
  if(checked.error||!checked.data)return unavailable;
  const {grant,file,file_grant:wrapped}=checked.data;
  if(!uuid(grant?.owner_id)||!uuid(grant?.vault_id)||!uuid(grant?.record_id)||grant.id!==body.grant_id||grant.recipient_id!==user||grant.permissions!=='view'||grant.grant_version!==1||grant.crypto_version!=='leqvor-v5'||file?.id!==body.file_id||file.owner_id!==grant.owner_id||file.vault_id!==grant.vault_id||file.record_id!==grant.record_id||file.crypto_version!=='leqvor-v5'||file.storage_path!==`${grant.owner_id}/${grant.record_id}/${body.file_id}`||wrapped?.grant_id!==grant.id||wrapped.file_id!==file.id||wrapped.recipient_id!==user||wrapped.owner_id!==grant.owner_id||wrapped.vault_id!==grant.vault_id||wrapped.record_id!==grant.record_id||wrapped.crypto_version!=='leqvor-v5')return unavailable;
  const storage=clientFactory(project,env.SUPABASE_SERVICE_ROLE_KEY,options);
  const downloaded=await storage.storage.from('vault-v5').download(file.storage_path);
  // Stay below the hosted function response limit; larger owner files remain private.
  if(downloaded.error||!downloaded.data||downloaded.data.size>4000000)return unavailable;
  const envelope=ciphertextEnvelope(JSON.parse(await downloaded.data.text()));
  // Check again after storage retrieval, so a revocation during the download
  // prevents the proxy from issuing a new response. No reusable signed URL.
  const current=await caller.rpc('read_v5_shared_file',{target:body.grant_id,selected_file:body.file_id});
  if(current.error||!current.data||current.data.file?.storage_path!==file.storage_path)return unavailable;
  return {status:200,body:envelope};
 }catch{return unavailable;}
}
