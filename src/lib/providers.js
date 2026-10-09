import { encryptedWrite, ciphertextEnvelope } from './ciphertextBoundary';
import { supabase } from "../supabase";
import { validateNewPassword } from './passwordPolicy';
import {AurevaError} from '../modules/security/safeEvents';
const requireClient = () => {
  if (!supabase) throw new Error("Vault connection unavailable.");
  return supabase;
};
const result = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};
const grantTransport=grant=>({id:grant.id,record_id:grant.record_id,owner_id:grant.owner_id,vault_id:grant.vault_id,recipient_id:grant.recipient_id,permissions:grant.permissions,grant_version:grant.grant_version,crypto_version:grant.crypto_version,salt:grant.salt,sender_public_material:grant.sender_public_material,encrypted_record_key:ciphertextEnvelope(grant.encrypted_record_key)});
const planningTable=kind=>{const table={policy:'verification_policies',rule:'trigger_rules',entry:'trigger_review_entries'}[kind];if(!table)throw new Error('Invalid planning collection.');return table;};
export const AuthProvider = {
  signIn: (email,password) => result(requireClient().auth.signInWithPassword({email,password})),
  signUp: async (email,password,name,redirectTo) => { validateNewPassword(password); return result(requireClient().auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{name}}})); },
  requestPasswordReset: (email,redirectTo) => result(requireClient().auth.resetPasswordForEmail(email,{redirectTo})),
  resendConfirmation: (email,redirectTo) => result(requireClient().auth.resend({type:'signup',email,options:{emailRedirectTo:redirectTo}})),
  assurance: () => result(requireClient().auth.mfa.getAuthenticatorAssuranceLevel()),
  factors: () => result(requireClient().auth.mfa.listFactors()),
  verifyMfa: (factorId,code) => result(requireClient().auth.mfa.challengeAndVerify({factorId,code})),
  enrollMfa: () => result(requireClient().auth.mfa.enroll({factorType:'totp',friendlyName:'LEQVOR authenticator'})),
  get configured() { return Boolean(supabase); },
  subscribe(listener) {
    const { data } = requireClient().auth.onAuthStateChange(listener);
    return () => data.subscription.unsubscribe();
  },
  updatePassword: async (password) => { validateNewPassword(password); return result(requireClient().auth.updateUser({ password })); },
  session: () => result(requireClient().auth.getSession()),
  signOut: () => result(requireClient().auth.signOut()),
  reauthenticate: async (password,code) => {
    const client = requireClient();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const owner = data?.user;
    if (!owner?.id || !owner.email) throw new AurevaError('AUTH_REQUIRED','Sign in again to continue.');
    const signedIn=await result(
      client.auth.signInWithPassword({ email: owner.email, password }),
    );
    if (signedIn?.user?.id !== owner.id || signedIn?.session?.user?.id !== owner.id)
      throw new AurevaError('AUTH_REQUIRED','Account verification failed. Sign in again.');
    const assurance=await result(client.auth.mfa.getAuthenticatorAssuranceLevel());
    const validAssurance = value => value && ['aal1','aal2'].includes(value.currentLevel) && ['aal1','aal2'].includes(value.nextLevel);
    if (!validAssurance(assurance)) throw new AurevaError('MFA_UNAVAILABLE','Verification status is unavailable. Try again.');
    if(assurance.nextLevel==='aal2'&&assurance.currentLevel!=='aal2'){
      if(!/^[0-9]{6}$/.test(code||''))throw new AurevaError('MFA_REQUIRED','Enter your six-digit authenticator code to continue.');
      const factors=await result(client.auth.mfa.listFactors());
      const factor=factors?.totp?.find(f=>f.status==='verified' && f.id);
      if(!factor)throw new AurevaError('MFA_UNAVAILABLE','Your verification method is unavailable.');
      await result(client.auth.mfa.challengeAndVerify({factorId:factor.id,code}));
      const verified = await result(client.auth.mfa.getAuthenticatorAssuranceLevel());
      if (!validAssurance(verified) || verified.currentLevel !== 'aal2')
        throw new AurevaError('MFA_REQUIRED','Verification did not establish a secure session. Try again.');
    }
    const current = await result(client.auth.getUser());
    if (current?.user?.id !== owner.id) throw new AurevaError('AUTH_REQUIRED','Your account changed during verification. Try again.');
    return signedIn;
  },
};
export const DatabaseProvider = {
  reviewSigningIdentity:()=>result(requireClient().from('review_signing_keys').select('*').maybeSingle()),
  registerReviewSigningIdentity:row=>{const {public_key,...encrypted}=row;return result(requireClient().rpc('register_v5_review_signing_key',{key_data:{...encryptedWrite('policy',encrypted),public_key:{kty:public_key.kty,crv:public_key.crv,x:public_key.x,y:public_key.y}}}));},
  requestTriggerReview:(rule,grant,key)=>result(requireClient().rpc('request_v5_trigger_review',{target_rule:rule,selected_grant:grant,expected_key:key})),
  decideTriggerReview:async(target,decision,signature)=>{
    const session=await result(requireClient().auth.getSession());
    if(!session?.session?.access_token)throw new Error('Sign in again to record this review.');
    const response=await fetch('/api/trigger-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.session.access_token}`},body:JSON.stringify({request_id:target,outcome:decision,signature}),signal:AbortSignal.timeout(30000),cache:'no-store'});
    if(!response.ok)throw new Error('Review unavailable. Verify your account and try again.');
    const body=await response.json();if(body.recorded!==true)throw new Error('Review was not recorded.');
  },
  cancelTriggerReview:target=>result(requireClient().rpc('cancel_v5_trigger_review',{target})),
  triggerReviewRequests:()=>result(requireClient().from('trigger_review_requests').select('*').order('created_at')),
  triggerReviewerDecisions:()=>result(requireClient().from('trigger_reviewer_decisions').select('*')),
  triggerPlanning:kind=>result(requireClient().from(planningTable(kind)).select('*').order('created_at')),
  saveTriggerPlanning:(kind,row)=>result(requireClient().from(planningTable(kind)).insert(encryptedWrite(kind,row)).select().single()),
  sharedFiles:id=>result(requireClient().rpc('list_v5_shared_files',{target:id})),
  readSharedFile:(id,fileId)=>result(requireClient().rpc('read_v5_shared_file',{target:id,selected_file:fileId})),
  inviteShareWithFiles:(grant,revision,publicKey,files)=>result(requireClient().rpc('invite_v5_record_with_files',{grant_data:grantTransport(grant),expected_revision:revision,recipient_key:publicKey,file_keys:files.map(file=>({grant_id:file.grant_id,file_id:file.file_id,record_id:file.record_id,owner_id:file.owner_id,vault_id:file.vault_id,recipient_id:file.recipient_id,crypto_version:file.crypto_version,salt:file.salt,sender_public_material:file.sender_public_material,encrypted_file_key:ciphertextEnvelope(file.encrypted_file_key)}))})),
  downloadSharedFile:async(id,fileId)=>{
    const session=await result(requireClient().auth.getSession());
    if(!session?.session?.access_token)throw new Error('Sign in again to download.');
    const response=await fetch('/api/shared-file',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.session.access_token}`},body:JSON.stringify({grant_id:id,file_id:fileId}),signal:AbortSignal.timeout(30000),cache:'no-store'});
    if(!response.ok)throw new Error('Shared file unavailable.');
    return ciphertextEnvelope(await response.json());
  },
  listShares:()=>result(requireClient().rpc('list_v5_shares')),
  acceptShare:id=>result(requireClient().rpc('accept_v5_share',{target:id})),
  revokeShare:id=>result(requireClient().rpc('revoke_v5_share',{target:id})),
  readShare:id=>result(requireClient().rpc('read_v5_share',{target:id})),
  inviteShare:(grant,revision,publicKey)=>result(requireClient().rpc('invite_v5_record',{
    grant_data:grantTransport(grant),
    expected_revision:revision,recipient_key:publicKey,
  })),
  allRecordVersions:()=>result(requireClient().from('record_revision_history').select('*')),
  recordVersions:id=>result(requireClient().from('record_revision_history').select('*').eq('record_id',id).order('revision',{ascending:false})),
  saveDocumentBundle:(row,revision,file,graph)=>result(requireClient().rpc('save_vnext_document',{record_data:encryptedWrite('record',row),expected_revision:revision,file_data:file?encryptedWrite('file',file):null,entity_data:graph.entities,edge_data:graph.edges.map(e=>encryptedWrite('edge',e))})),
  saveAssetBundle:(row,revision,file,graph)=>result(requireClient().rpc('save_vnext_asset',{record_data:encryptedWrite('record',row),expected_revision:revision,file_data:file?encryptedWrite('file',file):null,entity_data:graph.entities,edge_data:graph.edges.map(e=>encryptedWrite('edge',e))})),
  graphEntities:()=>result(requireClient().from('continuity_entities').select('*')),
  graphEdges:()=>result(requireClient().from('continuity_edges').select('*')),
  registerGraphEntity:({id,owner_id,vault_id,entity_type,record_id,person_id})=>result(requireClient().from('continuity_entities').insert({id,owner_id,vault_id,entity_type,record_id,person_id}).select().single()),
  saveGraphEdge:row=>result(requireClient().from('continuity_edges').insert(encryptedWrite('edge',row)).select().single()),
  sharingIdentity: () => result(requireClient().from('user_sharing_keys').select('*').maybeSingle()),
  registerSharingIdentity: (vaultId, identity) => result(requireClient().rpc('register_v5_sharing_identity', {
    target_vault:vaultId,
    key_data:{public_key:identity.public_key, encrypted_private_key:ciphertextEnvelope(identity.encrypted_private_key), crypto_version:'leqvor-v5'},
  })),
  vault: (owner) =>
    result(
      requireClient()
        .from("vaults")
        .select("*")
        .eq("owner_id", owner)
        .maybeSingle(),
    ),
  createVault: (row) =>
    result(requireClient().from("vaults").insert(encryptedWrite("vault", row)).select().single()),
  updateVault: (id, row) =>
    result(
      requireClient().from("vaults").update(encryptedWrite("vault", row)).eq("id", id).select().single(),
    ),
  listRecords: () =>
    result(
      requireClient()
        .from("records")
        .select("*")
        .order("created_at", { ascending: false }),
    ),
  saveRecord: (row) =>
    result(requireClient().from("records").insert(encryptedWrite("record", row)).select().single()),
  saveRecordBundle:(row,file)=>result(requireClient().rpc('save_v5_record_bundle',{record_data:encryptedWrite("record",row),file_data:file?encryptedWrite("file",file):null})),
  updateRecord: (id, row, revision) => result(requireClient().rpc('update_v5_record', {
    target_id:id, expected_revision:revision, record_data:encryptedWrite('record',row),
  })),
  deleteRecord: (id, revision) => result(requireClient().rpc('delete_v5_record', {
    target_id:id, expected_revision:revision,
  })),
  files: (record) =>
    result(
      requireClient().from("record_files").select("*").eq("record_id", record),
    ),
  allFiles: () => result(requireClient().from("record_files").select("*")),
  saveFile: (row) =>
    result(requireClient().from("record_files").insert(encryptedWrite("file", row)).select().single()),
  people: () => result(requireClient().from("trusted_people").select("*")),
  savePerson: (row) =>
    result(
      requireClient().from("trusted_people").insert(encryptedWrite("person", row)).select().single(),
    ),
  updatePerson: (row, expectedNonce) => result(requireClient().from('trusted_people')
    .update(encryptedWrite('person',row)).eq('id',row.id).eq('owner_id',row.owner_id)
    .eq('vault_id',row.vault_id).eq('encrypted_metadata->>nonce',expectedNonce).select().single()),
};
export const ObjectStorageProvider = {
  upload: (path, envelope) =>
    result(
      requireClient()
        .storage.from("vault-v5")
        .upload(
          path,
          new Blob([JSON.stringify(ciphertextEnvelope(envelope))], { type: "application/json" }),
          { upsert: false, contentType: "application/json" },
        ),
    ),
  download: async (path) => {
    const blob = await result(
      requireClient().storage.from("vault-v5").download(path),
    );
    if (blob.size > 16000000) throw new AurevaError('FILE_TOO_LARGE', 'The encrypted file exceeds the supported size.');
    return ciphertextEnvelope(JSON.parse(await blob.text()));
  },
  remove: (paths) =>
    paths.length
      ? result(requireClient().storage.from("vault-v5").remove(paths))
      : Promise.resolve(),
};
