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
