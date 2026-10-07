// Real Supabase Auth/PostgREST/Storage acceptance, not a browser UI test.
// Use two dedicated, empty test accounts. Never supply production user secrets.
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createVaultEnvelope,generateRecoverySecret,unlockVault,encryptRecord,decryptRecordPayload,encryptDocument,decryptDocument} from '../src/modules/security/v5Crypto.js';
import {encryptedWrite} from '../src/lib/ciphertextBoundary.js';

const URL='https://awdsyhxdnyfilnzamflt.supabase.co';
const check=(condition,label)=>{if(!condition)throw new Error(label);};
const data=async request=>{const response=await request;if(response.error)throw new Error('Backend request failed');return response.data;};
export async function runHostedWorkflow(a,b,report=()=>{}) {
  let stage='authenticate',vault,doc,record;
  let successful=false;
  const cleanup=[];
  try {
    const ua=await data(a.auth.getUser()),ub=await data(b.auth.getUser());
    check(ua?.user?.id && ub?.user?.id && ua.user.id!==ub.user.id,'Two distinct authenticated accounts required');
    for(const client of [a,b]) {
      for(const table of ['vaults','records','trusted_people'])
        check((await data(client.from(table).select('id').limit(1))).length===0,'Only empty test accounts are allowed');
    }
    report('PASS two distinct authenticated empty test accounts');
    stage='vault creation';
    const phrase=generateRecoverySecret();
    vault=await createVaultEnvelope(ua.user.id,randomBytes(32).toString('base64url'),phrase);
    await data(a.from('vaults').insert(encryptedWrite('vault',{...vault,recovery_verified_at:new Date().toISOString()})));
    const stored=await data(a.from('vaults').select('*').eq('id',vault.id).single());
    const key=await unlockVault(stored,phrase,true);
    report('PASS hosted vault creation and local recovery unlock');
    stage='encrypted record and upload';
    const id=crypto.randomUUID(),text=`LEQVOR_TEST_${crypto.randomUUID()}`;
    const row=await encryptRecord(key,{id,owner_id:ua.user.id,vault_id:vault.id,metadata:{title:text},payload:{instructions:text}});
    doc=await encryptDocument(key,{record_id:id,owner_id:ua.user.id,vault_id:vault.id,name:'acceptance.txt',type:'text/plain',bytes:new TextEncoder().encode(text)});
    check(!JSON.stringify({row,doc}).includes(text),'Plaintext detected in transport');
    await data(a.storage.from('vault-v5').upload(doc.row.storage_path,new Blob([JSON.stringify(doc.envelope)],{type:'application/json'}),{contentType:'application/json',upsert:false}));
    record=await data(a.rpc('save_v5_record_bundle',{record_data:encryptedWrite('record',row),file_data:encryptedWrite('file',doc.row)}));
    const fetched=await data(a.from('records').select('*').eq('id',id).single());
    check((await decryptRecordPayload(key,fetched)).instructions===text,'Reveal mismatch');
    const blob=await data(a.storage.from('vault-v5').download(doc.row.storage_path));
    const decoded=await decryptDocument(key,doc.row,JSON.parse(await blob.text()));
    check(new TextDecoder().decode(decoded.bytes)===text,'Download mismatch');decoded.bytes.fill(0);
    report('PASS ciphertext upload, record retrieval, local reveal and file download/decryption');
    stage='cross-account isolation';
    for(const [table,field,value] of [['vaults','id',vault.id],['records','id',id],['record_files','record_id',id]])
      check((await data(b.from(table).select('id').eq(field,value))).length===0,'Cross-account read allowed');
    check(!!(await b.storage.from('vault-v5').download(doc.row.storage_path)).error,'Cross-account file download allowed');
    check(!!(await b.rpc('update_v5_record',{target_id:id,expected_revision:record.revision,record_data:encryptedWrite('record',row)})).error,'Cross-account edit allowed');
    check(!!(await b.rpc('delete_v5_record',{target_id:id,expected_revision:record.revision})).error,'Cross-account delete allowed');
    // Storage remove may return success with zero objects under RLS. Check owner copy survives.
    await b.storage.from('vault-v5').remove([doc.row.storage_path]);
    await data(a.storage.from('vault-v5').download(doc.row.storage_path));
    report('PASS second account denied vault/record/file reads, edits and deletion');
    stage='edit and delete';
    const changed=await encryptRecord(key,{id,owner_id:ua.user.id,vault_id:vault.id,metadata:{title:'Edited test'},payload:{instructions:'Edited test'}});
    const oldRevision=record.revision;
    record=await data(a.rpc('update_v5_record',{target_id:id,expected_revision:oldRevision,record_data:encryptedWrite('record',changed)}));
    check((await decryptRecordPayload(key,await data(a.from('records').select('*').eq('id',id).single()))).instructions==='Edited test','Edit mismatch');
    check(!!(await a.rpc('update_v5_record',{target_id:id,expected_revision:oldRevision,record_data:encryptedWrite('record',changed)})).error,'Stale edit allowed');
    await data(a.rpc('delete_v5_record',{target_id:id,expected_revision:record.revision}));record=null;
    check((await data(a.from('records').select('id').eq('id',id))).length===0,'Record remains after delete');
    check((await data(a.from('record_files').select('id').eq('record_id',id))).length===0,'File metadata remains after delete');
    report('PASS persisted edit, stale revision rejection and record deletion');
    successful=true;
  } catch {
    report(`FAIL ${stage}; sensitive response details suppressed`);
  } finally {
    // Only random fixture IDs created in this invocation; no broad account purge.
    for(const [label,action] of [
      ['test record',()=>record ? data(a.rpc('delete_v5_record',{target_id:record.id,expected_revision:record.revision})) : null],
      ['test object',()=>doc ? data(a.storage.from('vault-v5').remove([doc.row.storage_path])) : null],
      ['test vault',()=>vault ? data(a.from('vaults').delete().eq('id',vault.id)) : null],
    ]) {try {await action();}catch {cleanup.push(label);}}
    if(cleanup.length) report(`FAIL fixture cleanup: ${cleanup.join(', ')}`);
  }
  return successful && !cleanup.length;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {LEQVOR_TEST_ANON_KEY:key,LEQVOR_TEST_TOKEN_A:ta,LEQVOR_TEST_TOKEN_B:tb}=process.env;
  if(!key || !ta || !tb) {
    console.error('BLOCKED: two dedicated empty-account sessions and the public project key are required. No hosted write attempted. Never paste session tokens into chat.');
    process.exitCode=2;
  } else {
    const client=token=>createClient(URL,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    // Explicit token argument authenticates these supplied sessions without storage.
    const a=client(ta),b=client(tb);
    const getA=a.auth.getUser.bind(a.auth),getB=b.auth.getUser.bind(b.auth);
    a.auth.getUser=()=>getA(ta);b.auth.getUser=()=>getB(tb);
    process.exitCode=await runHostedWorkflow(a,b,line=>console.log(line)) ? 0 : 1;
  }
}
