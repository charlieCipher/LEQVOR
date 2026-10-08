// Transport schemas deliberately exclude decrypted UI models.
const schemas = {
  edge: ['id','owner_id','vault_id','from_entity_id','to_entity_id','managed_record_id','crypto_version','encrypted_metadata','encrypted_payload','wrapped_dek'],
  record: ['id','owner_id','vault_id','crypto_version','encrypted_metadata','encrypted_payload','wrapped_dek','updated_at'],
  person: ['id','owner_id','vault_id','crypto_version','encrypted_metadata','encrypted_payload','wrapped_dek','status'],
  file: ['id','owner_id','vault_id','record_id','crypto_version','encrypted_filename','wrapped_file_dek','storage_path'],
  vault: ['id','owner_id','crypto_version','kdf_salt','kdf_parameters','recovery_salt','wrapped_vmk_password','wrapped_vmk_recovery','updated_at','recovery_verified_at'],
};
const encryptedFields = new Set(['encrypted_metadata','encrypted_payload','wrapped_dek','encrypted_filename','wrapped_file_dek','wrapped_vmk_password','wrapped_vmk_recovery']);
export function ciphertextEnvelope(value) {
  const keys=['crypto_version','algorithm','aad_version','nonce','ciphertext'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key=>!keys.includes(key)) ||
      value.crypto_version !== 'leqvor-v5' || value.algorithm !== 'AES-256-GCM' || value.aad_version !== 1 ||
      typeof value.nonce !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(value.nonce) ||
      typeof value.ciphertext !== 'string' || value.ciphertext.length < 24 ||
      value.ciphertext.length > 20*1024*1024 || value.ciphertext.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext))
    throw new Error('Invalid ciphertext transport envelope.');
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
export function encryptedWrite(kind, value) {
  const allowed=schemas[kind];
  if (!allowed || !value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key=>!allowed.includes(key)))
    throw new Error('Private or unsupported fields rejected at the transport boundary.');
  const output={};
  for (const [key,item] of Object.entries(value)) {
    if (encryptedFields.has(key)) output[key]=ciphertextEnvelope(item);
    else if (key==='kdf_parameters') {
      if (!item || item.algorithm!=='Argon2id' || Object.keys(item).some(k=>!['algorithm','t','m','p','dkLen'].includes(k)) ||
          !['t','m','p','dkLen'].every(k=>Number.isInteger(item[k]))) throw new Error('Invalid KDF transport parameters.');
      output[key]={...item};
    } else {
      if (typeof item !== 'string') throw new Error('Invalid operational transport field.');
      output[key]=item;
    }
  }
  return output;
}
