import {randomBytes} from 'node:crypto';
import process from 'node:process';
import {sharedFileDownload} from './shared-file-download.mjs';
import {createVaultEnvelope,generateRecoverySecret,unlockVault,createSharingIdentity,encryptRecord,createRecordGrant,decryptGrantedRecord,encryptDocument,createFileGrant,decryptGrantedDocument} from '../src/modules/security/v5Crypto.js';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys.js';
import {encryptedWrite} from '../src/lib/ciphertextBoundary.js';
const value=async request=>{const response=await request;if(response.error)throw new Error('Backend request failed');return response.data;};
const check=condition=>{if(!condition)throw new Error('Acceptance check failed');};
export async function runHostedSharing(a,b,report=()=>{}){
 let stage='identity',success=false,record,filePath;const vaults=[];
 try{
  const users=await Promise.all([a,b].map(async client=>(await value(client.auth.getUser())).user));check(users[0].id!==users[1].id);
  for(const client of [a,b])check((await value(client.from('vaults').select('id'))).length===0);
  const keys=[],identities=[];
  for(const [index,client] of [a,b].entries()){
   stage='vault and sharing identity';const phrase=generateRecoverySecret();
   const vault=await createVaultEnvelope(users[index].id,randomBytes(32).toString('base64url'),phrase);vaults.push(vault);
   await value(client.from('vaults').insert(encryptedWrite('vault',{...vault,recovery_verified_at:new Date().toISOString()})));
   const key=await unlockVault(vault,phrase,true);keys.push(key);
   const identity=await createSharingIdentity(key,users[index].id);
   identities.push(await value(client.rpc('register_v5_sharing_identity',{target_vault:vault.id,key_data:identity})));
  }
  stage='selected invitation';const sample='SYNTHETIC_SHARED_'+crypto.randomUUID();
  const row=await encryptRecord(keys[0],{owner_id:users[0].id,vault_id:vaults[0].id,metadata:{title:'Synthetic selected share'},payload:{instructions:sample}});
  const document=await encryptDocument(keys[0],{record_id:row.id,owner_id:users[0].id,vault_id:vaults[0].id,name:'Synthetic attachment.txt',type:'text/plain',bytes:new TextEncoder().encode(sample)});
  filePath=document.row.storage_path;
  await value(a.storage.from('vault-v5').upload(filePath,new Blob([JSON.stringify(document.envelope)],{type:'application/json'}),{upsert:false,contentType:'application/json'}));
  record=await value(a.rpc('save_v5_record_bundle',{record_data:encryptedWrite('record',row),file_data:encryptedWrite('file',document.row)}));
  const grant=await createRecordGrant(keys[0],record,users[1].id,identities[1].public_key,await recipientKeyFingerprint(identities[1].public_key));
  check(!JSON.stringify(grant).includes(sample));
  const wrapper=await createFileGrant(keys[0],document.row,grant,identities[1].public_key,await recipientKeyFingerprint(identities[1].public_key));
  await value(a.rpc('invite_v5_record_with_files',{grant_data:grant,expected_revision:record.revision,recipient_key:identities[1].public_key,file_keys:[wrapper]}));
  check(!!(await b.rpc('read_v5_share',{target:grant.id})).error);
  check(!!(await a.rpc('accept_v5_share',{target:grant.id})).error);
  check((await value(b.from('records').select('id').eq('id',record.id))).length===0);
  await value(b.rpc('accept_v5_share',{target:grant.id}));
  const shared=await value(b.rpc('read_v5_share',{target:grant.id}));check(!('wrapped_dek' in shared.record));
  check((await decryptGrantedRecord(keys[1],identities[1],shared.grant,shared.record)).payload.instructions===sample);
  report('PASS hosted invitation acceptance, selected-revision decryption and owner-vault isolation');
  stage='selected attachment download';
  check((await value(b.from('record_files').select('id').eq('id',document.row.id))).length===0);
  check(!!(await b.storage.from('vault-v5').download(filePath)).error);
  const bundle=await value(b.rpc('read_v5_shared_file',{target:grant.id,selected_file:document.row.id}));check(!('wrapped_file_dek' in bundle.file));
  const signed=await value(b.auth.getSession());
  const input={method:'POST',authorization:`Bearer ${signed.session.access_token}`,body:{grant_id:grant.id,file_id:document.row.id},env:{...process.env,VITE_SUPABASE_ANON_KEY:process.env.LEQVOR_TEST_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY}};
  const downloaded=await sharedFileDownload(input);check(downloaded.status===200);
  const decoded=await decryptGrantedDocument(keys[1],identities[1],bundle.grant,bundle.file,bundle.file_grant,downloaded.body);
  check(new TextDecoder().decode(decoded.bytes)===sample);decoded.bytes.fill(0);
  report('PASS hosted selected encrypted attachment authorization and client decryption; direct storage denied');
  stage='revocation';await value(a.rpc('revoke_v5_share',{target:grant.id}));
  check(!!(await b.rpc('read_v5_share',{target:grant.id})).error);
  check(!!(await b.rpc('accept_v5_share',{target:grant.id})).error);
  check((await sharedFileDownload(input)).status===404);
  report('PASS revoked share cannot be retrieved or accepted again');success=true;
 }catch{report(`FAIL sharing workflow: ${stage}; sensitive details suppressed`);}
 finally{
  try{if(record)await value(a.rpc('delete_v5_record',{target_id:record.id,expected_revision:record.revision}));report('PASS synthetic shared record removed');}
  catch{success=false;report('FAIL shared record cleanup');}
  try{if(filePath)await value(a.storage.from('vault-v5').remove([filePath]));}
  catch{success=false;report('FAIL synthetic encrypted attachment cleanup');}
  // The wrapper removes only generated users and their sharing identities.
 }
 return success;
}
