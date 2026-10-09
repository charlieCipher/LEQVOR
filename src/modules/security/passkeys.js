import {AurevaError} from './safeEvents';

// Authentication only. A successful ceremony never supplies or unlocks a VMK.
export function passkeySupported(runtime=globalThis){
 return runtime.isSecureContext===true&&typeof runtime.PublicKeyCredential==='function'&&typeof runtime.navigator?.credentials?.get==='function'&&typeof runtime.navigator?.credentials?.create==='function';
}
export function createPasskeyAdapter(client,enabled,runtime=globalThis){
 const available=()=>enabled===true&&passkeySupported(runtime)&&typeof client?.auth?.signInWithPasskey==='function'&&typeof client?.auth?.registerPasskey==='function';
 const guard=()=>{if(!available())throw new AurevaError('PASSKEY_UNAVAILABLE','Passkeys are not enabled here. Use your account password.');};
 async function call(action){
  guard();
  try{const {data,error}=await action();if(error)throw error;return data;}
  catch(error){
   if(error?.code==='passkey_disabled')throw new AurevaError('PASSKEY_DISABLED','Passkeys are not enabled for this account service. Use your password.');
   if(error?.name==='NotAllowedError')throw new AurevaError('PASSKEY_CANCELLED','Passkey verification was cancelled. Try again or use your password.');
   throw new AurevaError('PASSKEY_FAILED','Passkey verification could not complete. Try again or use your password.');
  }
 }
 return {
  get available(){return available();},
  signIn:()=>call(()=>client.auth.signInWithPasskey()),
  register:()=>call(async()=>{const user=await client.auth.getUser();if(user.error||!user.data?.user?.id||user.data.user.is_anonymous||!user.data.user.email_confirmed_at)throw new Error('Confirmed account required');return client.auth.registerPasskey();}),
  list:async()=>{
   const rows=await call(()=>client.auth.passkey.list());
   if(!Array.isArray(rows)||rows.length>100||rows.some(row=>typeof row?.id!=='string'||row.id.length>100||!Number.isFinite(Date.parse(row.created_at))||(row.friendly_name!==undefined&&(typeof row.friendly_name!=='string'||row.friendly_name.length>120))))throw new AurevaError('PASSKEY_LIST_FAILED','Registered passkeys could not be verified. Try again.');
   return rows.map(({id,friendly_name,created_at})=>({id,friendly_name,created_at}));
  },
 };
}
