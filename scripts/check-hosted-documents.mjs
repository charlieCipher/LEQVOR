import {randomBytes} from 'node:crypto';
import {createVaultEnvelope,generateRecoverySecret,unlockVault,encryptRecord,decryptRecordPayload,encryptDocument,decryptDocument} from '../src/modules/security/v5Crypto.js';
import {encryptedWrite} from '../src/lib/ciphertextBoundary.js';

const value=async request=>{const response=await request;if(response.error)throw new Error('Backend request failed');return response.data;};
const check=(condition)=>{if(!condition)throw new Error('Acceptance check failed');};
export async function runHostedDocuments(a,b,report=()=>{}){
 let stage='identity',vault,record,person,success=false;const files=[];
 try{
  const user=(await value(a.auth.getUser())).user;
  const other=(await value(b.auth.getUser())).user;check(user.id!==other.id);
  for(const client of [a,b])for(const table of ['vaults','records','trusted_people'])check((await value(client.from(table).select('id').limit(1))).length===0);
  stage='vault';const phrase=generateRecoverySecret();vault=await createVaultEnvelope(user.id,randomBytes(32).toString('base64url'),phrase);
  await value(a.from('vaults').insert(encryptedWrite('vault',{...vault,recovery_verified_at:new Date().toISOString()})));
  const key=await unlockVault(vault,phrase,true);
  stage='document links and evidence';
  person=await encryptRecord(key,{owner_id:user.id,vault_id:vault.id,metadata:{display_name:'Synthetic custodian'},payload:{}});
  await value(a.from('trusted_people').insert(encryptedWrite('person',{...person,status:'unverified'})));
  const id=crypto.randomUUID(),identity={id,owner_id:user.id,vault_id:vault.id};
  const nodes=[{...identity,entity_type:'DOCUMENT',record_id:id,person_id:null},{id:person.id,owner_id:user.id,vault_id:vault.id,entity_type:'PERSON',record_id:null,person_id:person.id}];
  const edges=async()=>[{...await encryptRecord(key,{owner_id:user.id,vault_id:vault.id,metadata:{},payload:{from_entity_id:id,to_entity_id:person.id,relation_type:'ORIGINAL_HELD_BY'}}),from_entity_id:id,to_entity_id:person.id,managed_record_id:id}];
  async function save(revision,location){
   const row=await encryptRecord(key,{...identity,metadata:{title:'Synthetic document',continuity_kind:'DOCUMENT'},payload:{original_location:location,continuity_details:{kind:'DOCUMENT',document:{custodians:[person.id],professionals:[],people:[],assets:[]}}}});
   const file=await encryptDocument(key,{record_id:id,owner_id:user.id,vault_id:vault.id,name:'synthetic.txt',type:'text/plain',bytes:new TextEncoder().encode(location)});files.push(file);
   check(!JSON.stringify({row,file}).includes(location));
   await value(a.storage.from('vault-v5').upload(file.row.storage_path,new Blob([JSON.stringify(file.envelope)],{type:'application/json'}),{contentType:'application/json',upsert:false}));
   return value(a.rpc('save_vnext_document',{record_data:encryptedWrite('record',row),expected_revision:revision,file_data:encryptedWrite('file',file.row),entity_data:nodes,edge_data:(await edges()).map(edge=>encryptedWrite('edge',edge))}));
  }
  const first='SYNTHETIC_ORIGINAL_'+crypto.randomUUID(),second='SYNTHETIC_UPDATED_'+crypto.randomUUID();
  record=await save(null,first);record=await save(record.revision,second);
  const history=await value(a.from('record_revision_history').select('*').eq('record_id',id).order('revision'));
  check(history.length===2&&history[0].files.length===1&&history[1].files.length===2);
  check((await decryptRecordPayload(key,history[0].snapshot)).original_location===first);
  check((await decryptRecordPayload(key,history[1].snapshot)).original_location===second);
  const blob=await value(a.storage.from('vault-v5').download(history[0].files[0].storage_path));
  const decoded=await decryptDocument(key,history[0].files[0],JSON.parse(await blob.text()));
  check(new TextDecoder().decode(decoded.bytes)===first);decoded.bytes.fill(0);
  report('PASS hosted document links, encrypted evidence, two persisted revisions and historical attachment decryption');
  stage='immutable history and isolation';
  check((await value(b.from('record_revision_history').select('*').eq('record_id',id))).length===0);
  check(!!(await a.from('record_revision_history').update({snapshot:{}}).eq('record_id',id)).error);
  check(!!(await a.from('record_revision_history').delete().eq('record_id',id)).error);
  check((await value(a.from('record_revision_history').select('revision').eq('record_id',id))).length===2);
  report('PASS hosted history mutation/deletion denied and history hidden from the second account');
  success=true;
 }catch{report(`FAIL document workflow: ${stage}; sensitive details suppressed`);}
 finally{
  try{
   if(record)await value(a.rpc('delete_v5_record',{target_id:record.id,expected_revision:record.revision}));
   if(files.length)await value(a.storage.from('vault-v5').remove(files.map(file=>file.row.storage_path)));
   if(person)await value(a.from('trusted_people').delete().eq('id',person.id));
   if(vault)await value(a.from('vaults').delete().eq('id',vault.id));
   report('PASS document test fixtures cleaned up');
  }catch{success=false;report('FAIL document fixture cleanup');}
 }
 return success;
}
