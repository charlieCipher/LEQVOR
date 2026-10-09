import {randomBytes} from 'node:crypto';
import {createServer} from 'vite';
import {createVaultEnvelope,generateRecoverySecret,unlockVault,createSharingIdentity,encryptRecord,decryptRecordPayload,encryptDocument,decryptDocument,createRecordGrant,decryptGrantedRecord} from '../src/modules/security/v5Crypto.js';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys.js';
import {encryptedWrite} from '../src/lib/ciphertextBoundary.js';
const value=async request=>{const response=await request;if(response.error)throw new Error('Backend request failed');return response.data;};
const check=condition=>{if(!condition)throw new Error('Acceptance check failed');};
const grantWire=g=>Object.fromEntries(['id','record_id','owner_id','vault_id','recipient_id','permissions','grant_version','crypto_version','salt','sender_public_material','encrypted_record_key'].map(k=>[k,g[k]]));
const table=kind=>({policy:'verification_policies',rule:'trigger_rules',entry:'trigger_review_entries'})[kind];

// Ordinary authenticated clients do all workflow operations. Admin credentials
// remain exclusively in the disposable-account harness for creation/cleanup.
export async function runHostedArchitecture(a,b,report=()=>{}){
 let stage='setup',success=false,server;const vaults=[],sessions=[],paths=[],records=[];
 try{
  server=await createServer({server:{middlewareMode:true},appType:'custom'});
  const {TriggerPlanningService}=await server.ssrLoadModule('/src/modules/continuity/TriggerPlanningService.js');
  const {VaultSession}=await server.ssrLoadModule('/src/modules/security/VaultSession.js');
  const {insuranceGraph}=await server.ssrLoadModule('/src/modules/continuity/insuranceGraph.js');
  const users=await Promise.all([a,b].map(async client=>(await value(client.auth.getUser())).user));check(users[0].id!==users[1].id);
  const keys=[],sharing=[];
  for(const [i,client] of [a,b].entries()){
   check((await value(client.from('vaults').select('id'))).length===0);
   const phrase=generateRecoverySecret(),vault=await createVaultEnvelope(users[i].id,randomBytes(32).toString('base64url'),phrase);vaults.push(vault);
   await value(client.from('vaults').insert(encryptedWrite('vault',{...vault,recovery_verified_at:new Date().toISOString()})));
   const key=await unlockVault(vault,phrase,true);keys.push(key);const session=new VaultSession();session.unlock(key);sessions.push(session);
   const identity=await createSharingIdentity(key,users[i].id);sharing.push(await value(client.rpc('register_v5_sharing_identity',{target_vault:vault.id,key_data:identity})));
  }
  const adapter=client=>({
   reviewSigningIdentity:()=>value(client.from('review_signing_keys').select('*').maybeSingle()),
   registerReviewSigningIdentity:row=>{const {public_key,...encrypted}=row;const {kty,crv,x,y}=public_key;return value(client.rpc('register_v5_review_signing_key',{key_data:{...encryptedWrite('policy',encrypted),public_key:{kty,crv,x,y}}}));},
   createTriggerManifest:data=>value(client.rpc('create_v5_trigger_manifest',data)),
   triggerManifestReadiness:target=>value(client.rpc('v5_trigger_manifest_readiness',{target})),
   requestTriggerReview:(rule,grant,key,manifest)=>value(client.rpc('request_v5_trigger_review',{target_rule:rule,selected_grant:grant,expected_key:key,target_manifest:manifest})),
   deliverTriggerReview:(target,row,grant)=>{const {wrapped_dek,...packet}=row;void wrapped_dek;return value(client.rpc('deliver_v5_trigger_review',{target,record_data:packet,grant_data:grantWire(grant)}));},
   readTriggerReview:target=>value(client.rpc('read_v5_trigger_review',{target})),
   sharingIdentity:()=>value(client.from('user_sharing_keys').select('*').single()),
   triggerPlanning:kind=>value(client.from(table(kind)).select('*')),
   saveTriggerPlanning:(kind,row)=>value(client.from(table(kind)).insert(encryptedWrite(kind,row)).select().single()),
   authorizeReviewedInvitation:(target_manifest,grant,recipient_key)=>value(client.rpc('authorize_v5_reviewed_invitation',{target_manifest,grant_data:grantWire(grant),recipient_key})),
   decideTriggerReview:async(request_id,outcome,signature)=>{
    const {session}=await value(client.auth.getSession());
    const response=await fetch('https://leqvor.vercel.app/api/trigger-review',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({request_id,outcome,signature}),signal:AbortSignal.timeout(30000)});
    check(response.ok&&response.headers.get('cache-control')?.includes('no-store'));check((await response.json()).recorded===true);
   }
  });
  const owner=new TriggerPlanningService(sessions[0],vaults[0],adapter(a)),reviewer=new TriggerPlanningService(sessions[1],vaults[1],adapter(b));
  stage='encrypted policy graph';const sample='SYNTHETIC_POLICY_'+crypto.randomUUID();
  let record=await encryptRecord(keys[0],{owner_id:users[0].id,vault_id:vaults[0].id,metadata:{title:'Synthetic policy',continuity_kind:'POLICY',category:'Insurance'},payload:{insurance:{owner_id:'self',insured_ids:[],beneficiary_ids:[],asset_ids:[]},instructions:sample}});
  const graph=await insuranceGraph(keys[0],record,{owner_id:'self'});
  const file=await encryptDocument(keys[0],{record_id:record.id,owner_id:users[0].id,vault_id:vaults[0].id,name:'synthetic.txt',type:'text/plain',bytes:new TextEncoder().encode(sample)});paths.push(file.row.storage_path);
  await value(a.storage.from('vault-v5').upload(file.row.storage_path,new Blob([JSON.stringify(file.envelope)],{type:'application/json'}),{contentType:'application/json',upsert:false}));
  record=await value(a.rpc('save_vnext_policy',{record_data:encryptedWrite('record',record),expected_revision:null,file_data:encryptedWrite('file',file.row),entity_data:graph.entities,edge_data:graph.edges}));records.push(record);
  check((await decryptRecordPayload(keys[0],record)).instructions===sample);
  const edited=await encryptRecord(keys[0],{id:record.id,owner_id:users[0].id,vault_id:vaults[0].id,metadata:{title:'Synthetic edited policy',continuity_kind:'POLICY',category:'Insurance'},payload:{insurance:{owner_id:'self'},instructions:sample,notes:'Synthetic updated notes'}});
  const saveArgs={record_data:encryptedWrite('record',edited),expected_revision:record.revision,file_data:null,entity_data:graph.entities,edge_data:graph.edges};
  record=await value(a.rpc('save_vnext_policy',saveArgs));records[0]=record;
  check(record.revision===2&&(await decryptRecordPayload(keys[0],record)).notes==='Synthetic updated notes');
  check(!!(await a.rpc('save_vnext_policy',saveArgs)).error);
  const downloaded=await value(a.storage.from('vault-v5').download(file.row.storage_path));const decoded=await decryptDocument(keys[0],file.row,JSON.parse(await downloaded.text()));check(new TextDecoder().decode(decoded.bytes)===sample);decoded.bytes.fill(0);
  check((await value(b.from('records').select('id').eq('id',record.id))).length===0);check(!!(await b.storage.from('vault-v5').download(file.row.storage_path)).error);
  report('PASS hosted encrypted Insurance graph creation/edit, stale-write rejection, file download/decryption and cross-account isolation');
  stage='review prerequisites';const signer=await reviewer.enrollSigningKey(),fingerprint=await recipientKeyFingerprint(sharing[1].public_key);
  const person={id:crypto.randomUUID(),owner_id:users[0].id,vault_id:vaults[0].id,recipient_binding:{account_id:users[1].id,public_key:sharing[1].public_key,fingerprint,verified_at:new Date().toISOString()},review_signing_binding:{account_id:users[1].id,key_id:signer.id,public_key:signer.public_key,fingerprint:await recipientKeyFingerprint(signer.public_key),verified_at:new Date().toISOString()}};
  const grant=await createRecordGrant(keys[0],record,users[1].id,sharing[1].public_key,fingerprint);
  await value(a.rpc('invite_v5_record',{grant_data:grantWire(grant),expected_revision:record.revision,recipient_key:sharing[1].public_key}));await value(b.rpc('accept_v5_share',{target:grant.id}));
  const accepted=await value(a.from('record_grants').select('*').eq('id',grant.id).single());
  const policy=await owner.savePolicy({reviewer_ids:[person.id],minimum_approvals:1,evidence_expiry_days:30,required_evidence:['Synthetic administrative requirement'],instructions:'Synthetic review instructions'},[person]);
  const rule=await owner.saveRule(policy,record,{trigger_type:'OWNER_APPROVAL',authority:'VIEW',instructions:'Synthetic owner review'});
  stage='committed review context';const manifest=await owner.createManifest(rule,[person],[accepted],[{record,observed_at:new Date().toISOString()}],person);
  const requestId=await owner.requestReview(rule,person,accepted,manifest);await owner.deliverReview(requestId,manifest,rule,policy,person,[record]);
  const request=await value(b.from('trigger_review_requests').select('*').eq('id',requestId).single());check((await reviewer.revealReview(request)).evidence[0].payload.instructions===sample);
  check(!!(await a.rpc('read_v5_trigger_review',{target:requestId})).error);
  stage='hosted signed approval';await reviewer.decide(request,'APPROVED');check((await owner.readiness(manifest)).state==='READY_FOR_OWNER_REVIEW');
  stage='explicit one-use authorization';const invitation=await owner.authorize(manifest,record,person);check(!!(await b.rpc('read_v5_share',{target:invitation})).error);
  await value(b.rpc('accept_v5_share',{target:invitation}));const received=await value(b.rpc('read_v5_share',{target:invitation}));check((await decryptGrantedRecord(keys[1],sharing[1],received.grant,received.record)).payload.instructions===sample);
  let replayDenied=false;try{await owner.authorize(manifest,record,person);}catch{replayDenied=true;}check(replayDenied);
  await value(a.rpc('revoke_v5_share',{target:grant.id}));check(!!(await b.rpc('read_v5_trigger_review',{target:requestId})).error);
  await value(a.rpc('revoke_v5_share',{target:invitation}));check(!!(await b.rpc('read_v5_share',{target:invitation})).error);
  report('PASS hosted encrypted review delivery, real ECDSA API approval, owner authorization, recipient acceptance, replay rejection and revocation');success=true;
 }catch{report(`FAIL architecture workflow: ${stage}; sensitive details suppressed`);}
 finally{
  sessions.forEach(session=>session.dispose());if(server)await server.close();
  let cleanupStage='record deletion';
  try{for(const record of records)await value(a.rpc('delete_v5_record',{target_id:record.id,expected_revision:record.revision}));cleanupStage='encrypted file removal';if(paths.length)await value(a.storage.from('vault-v5').remove(paths));report('PASS architecture record/file fixtures cleaned up');}catch{success=false;report(`FAIL architecture fixture cleanup: ${cleanupStage}`);}
  // As in the sharing harness, account cleanup owns vault/sharing-key lifecycle.
  // Do not widen owner DELETE permissions just to simplify test teardown.
 }
 return success;
}
