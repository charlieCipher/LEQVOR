import { argon2idAsync } from "@noble/hashes/argon2.js";
import {
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { validateNewPassword } from '../../lib/passwordPolicy.js';
import { verifyRecipientKey } from './recipientKeys.js';

export const CRYPTO_VERSION = "leqvor-v5";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const KDF = Object.freeze({
  algorithm: "Argon2id",
  t: 3,
  m: 65536,
  p: 1,
  dkLen: 32,
});
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const encode = (bytes) =>
  btoa(
    Array.from(new Uint8Array(bytes), (b) => String.fromCharCode(b)).join(""),
  );
function decode(text, max = 20 * 1024 * 1024) {
  if (typeof text !== "string" || text.length > max)
    throw new Error("Invalid encrypted object.");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export const newId = () => crypto.randomUUID();
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export async function digest(value) {
  return encode(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(JSON.stringify(canonical(value))),
    ),
  );
}
const context = (id, purpose) =>
  encoder.encode(JSON.stringify([CRYPTO_VERSION, 1, id, purpose]));
async function aes(raw) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
async function sealBytes(key, bytes, id, purpose) {
  const nonce = random(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: context(id, purpose),
      tagLength: 128,
    },
    key,
    bytes,
  );
  return {
    crypto_version: CRYPTO_VERSION,
    algorithm: "AES-256-GCM",
    aad_version: 1,
    nonce: encode(nonce),
    ciphertext: encode(ciphertext),
  };
}
async function openBytes(key, envelope, id, purpose) {
  if (
    envelope?.crypto_version !== CRYPTO_VERSION ||
    envelope.algorithm !== "AES-256-GCM" ||
    envelope.aad_version !== 1
  )
    throw new Error("Unsupported crypto format.");
  const nonce = decode(envelope.nonce, 24);
  if (nonce.length !== 12) throw new Error("Invalid nonce.");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: context(id, purpose),
        tagLength: 128,
      },
      key,
      decode(envelope.ciphertext),
    ),
  );
}
async function sealJSON(key, value, id, purpose) {
  const bytes = encoder.encode(JSON.stringify(value));
  try {
    return await sealBytes(key, bytes, id, purpose);
  } finally {
    bytes.fill(0);
  }
}
async function openJSON(key, value, id, purpose) {
  const bytes = await openBytes(key, value, id, purpose);
  try {
    return JSON.parse(decoder.decode(bytes));
  } finally {
    bytes.fill(0);
  }
}
async function passwordKey(password, salt, parameters = KDF) {
  if (typeof password !== "string" || password.length < 12)
    throw new Error("Use at least 12 characters for your vault password.");
  if (JSON.stringify(canonical(parameters)) !== JSON.stringify(canonical(KDF)))
    throw new Error("Unsupported key derivation parameters.");
  const saltBytes = decode(salt, 32);
  if (saltBytes.length !== 16) throw new Error("Invalid key derivation salt.");
  const passwordBytes = encoder.encode(password);
  let bytes;
  try {
    bytes = await argon2idAsync(passwordBytes, saltBytes, {
      t: 3,
      m: 65536,
      p: 1,
      dkLen: 32,
    });
    return await aes(bytes);
  } finally {
    passwordBytes.fill(0);
    bytes?.fill(0);
  }
}
function normalizePhrase(phrase) {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}
async function recoveryKey(phrase, salt) {
  const normalized = normalizePhrase(phrase);
  if (
    normalized.split(" ").length !== 24 ||
    !validateMnemonic(normalized, wordlist)
  )
    throw new Error("Enter your valid 24-word recovery secret.");
  const entropy = mnemonicToEntropy(normalized, wordlist);
  try {
    const key = await crypto.subtle.importKey("raw", entropy, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: decode(salt, 32),
        info: encoder.encode("leqvor-v5-recovery-kek"),
      },
      key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    entropy.fill(0);
  }
}
export function generateRecoverySecret() {
  return generateMnemonic(wordlist, 256);
}
export async function createVaultEnvelope(ownerId, password, phrase) {
  validateNewPassword(password);
  const id = newId(),
    raw = random(32),
    kdf_salt = encode(random(16)),
    recovery_salt = encode(random(16));
  try {
    const pw = await passwordKey(password, kdf_salt),
      rk = await recoveryKey(phrase, recovery_salt);
    return {
      id,
      owner_id: ownerId,
      crypto_version: CRYPTO_VERSION,
      kdf_salt,
      kdf_parameters: { ...KDF },
      recovery_salt,
      wrapped_vmk_password: await sealBytes(pw, raw, id, "password-vmk"),
      wrapped_vmk_recovery: await sealBytes(rk, raw, id, "recovery-vmk"),
    };
  } finally {
    raw.fill(0);
  }
}
async function rawVMK(vault, secret, recovery) {
  if (vault.crypto_version !== CRYPTO_VERSION)
    throw new Error("Unsupported vault format.");
  const kek = recovery
    ? await recoveryKey(secret, vault.recovery_salt)
    : await passwordKey(secret, vault.kdf_salt, vault.kdf_parameters);
  const bytes = await openBytes(
    kek,
    recovery ? vault.wrapped_vmk_recovery : vault.wrapped_vmk_password,
    vault.id,
    recovery ? "recovery-vmk" : "password-vmk",
  );
  if (bytes.length !== 32) {
    bytes.fill(0);
    throw new Error("Invalid master key.");
  }
  return bytes;
}
export async function unlockVault(vault, secret, recovery = false) {
  const raw = await rawVMK(vault, secret, recovery);
  try {
    return await aes(raw);
  } finally {
    raw.fill(0);
  }
}
export async function rewrapVaultPassword(
  vault,
  currentSecret,
  newPassword,
  recovery = false,
) {
  validateNewPassword(newPassword);
  const raw = await rawVMK(vault, currentSecret, recovery),
    salt = encode(random(16));
  try {
    const kek = await passwordKey(newPassword, salt);
    return {
      kdf_salt: salt,
      kdf_parameters: { ...KDF },
      wrapped_vmk_password: await sealBytes(kek, raw, vault.id, "password-vmk"),
    };
  } finally {
    raw.fill(0);
  }
}
export async function encryptRecord(
  vmk,
  { id = newId(), owner_id, vault_id, metadata, payload },
) {
  const raw = random(32);
  try {
    const dek = await aes(raw);
    return {
      id,
      owner_id,
      vault_id,
      crypto_version: CRYPTO_VERSION,
      encrypted_metadata: await sealJSON(dek, metadata, id, "metadata"),
      encrypted_payload: await sealJSON(dek, payload, id, "payload"),
      wrapped_dek: await sealBytes(vmk, raw, id, "record-dek"),
    };
  } finally {
    raw.fill(0);
  }
}
async function recordKey(vmk, record) {
  const raw = await openBytes(vmk, record.wrapped_dek, record.id, "record-dek");
  try {
    return await aes(raw);
  } finally {
    raw.fill(0);
  }
}
export async function decryptRecordMetadata(vmk, record) {
  return openJSON(
    await recordKey(vmk, record),
    record.encrypted_metadata,
    record.id,
    "metadata",
  );
}
export async function decryptRecordPayload(vmk, record) {
  return openJSON(
    await recordKey(vmk, record),
    record.encrypted_payload,
    record.id,
    "payload",
  );
}
export async function encryptDocument(
  vmk,
  { id = newId(), record_id, owner_id, vault_id, name, type, bytes },
) {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("Choose a file smaller than 10 MB.");
  const raw = random(32);
  try {
    const dek = await aes(raw),
      envelope = await sealBytes(dek, bytes, id, "file");
    return {
      row: {
        id,
        record_id,
        owner_id,
        vault_id,
        crypto_version: CRYPTO_VERSION,
        storage_path: `${owner_id}/${record_id}/${id}`,
        encrypted_filename: await sealJSON(dek, { name, type }, id, "filename"),
        wrapped_file_dek: await sealBytes(vmk, raw, id, "file-dek"),
      },
      envelope,
    };
  } finally {
    raw.fill(0);
  }
}
export async function decryptDocument(vmk, row, envelope) {
  const raw = await openBytes(vmk, row.wrapped_file_dek, row.id, "file-dek");
  try {
    const dek = await aes(raw);
    return {
      ...(await openJSON(dek, row.encrypted_filename, row.id, "filename")),
      bytes: await openBytes(dek, envelope, row.id, "file"),
    };
  } finally {
    raw.fill(0);
  }
}

// AES CryptoKeys are non-extractable and held only by the session controller.
// JavaScript cannot guarantee erasure of copies retained by the browser/GC.

export async function createSharingIdentity(vmk, ownerId) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const public_key = await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  try {
    return {
      owner_id: ownerId,
      public_key,
      encrypted_private_key: await sealJSON(
        vmk,
        privateJwk,
        ownerId,
        "sharing-private",
      ),
      crypto_version: CRYPTO_VERSION,
    };
  } finally {
    privateJwk.d = "";
  }
}
async function sharingPrivate(vmk, identity) {
  const jwk = await openJSON(
    vmk,
    identity.encrypted_private_key,
    identity.owner_id,
    "sharing-private",
  );
  try {
    if (['kty','crv','x','y'].some(field=>jwk[field]!==identity.public_key?.[field]))
      throw new Error('Sharing key does not match its encrypted private key.');
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } finally {
    jwk.d = "";
  }
}
export async function verifySharingIdentity(vmk, identity) {
  await sharingPrivate(vmk, identity);
}
async function sharedKey(privateKey, publicJwk, salt) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      privateKey,
      256,
    ),
  );
  try {
    const source = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: decode(salt, 32),
        info: encoder.encode("leqvor-v5-continuity-grant"),
      },
      source,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    bytes.fill(0);
  }
}
export async function createRecordGrant(
  vmk,
  record,
  recipientId,
  verifiedPublicKey,
  expectedFingerprint,
) {
  if (!recipientId || recipientId === record.owner_id) throw new Error('Invalid recipient.');
  await verifyRecipientKey(verifiedPublicKey, expectedFingerprint);
  const ephemeral = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ),
    id = newId(),
    salt = encode(random(16)),
    raw = await openBytes(vmk, record.wrapped_dek, record.id, "record-dek");
  try {
    const kek = await sharedKey(ephemeral.privateKey, verifiedPublicKey, salt);
    return {
      id,
      record_id: record.id,
      owner_id: record.owner_id,
      recipient_id: recipientId,
      vault_id: record.vault_id,
      permissions: "view",
      grant_version: 1,
      crypto_version: CRYPTO_VERSION,
      sender_public_material: await crypto.subtle.exportKey(
        "jwk",
        ephemeral.publicKey,
      ),
      salt,
      encrypted_record_key: await sealBytes(
        kek,
        raw,
        `${id}:${record.id}:${recipientId}`,
        "grant-dek",
      ),
    };
  } finally {
    raw.fill(0);
  }
}
export async function decryptGrantedRecord(
  recipientVMK,
  identity,
  grant,
  record,
) {
  if (grant.recipient_id !== identity.owner_id || grant.record_id !== record.id ||
      grant.owner_id !== record.owner_id || grant.vault_id !== record.vault_id ||
      grant.permissions !== 'view' || grant.grant_version !== 1 ||
      grant.crypto_version !== CRYPTO_VERSION || identity.crypto_version !== CRYPTO_VERSION)
    throw new Error("Grant identity mismatch.");
  const privateKey = await sharingPrivate(recipientVMK, identity),
    kek = await sharedKey(privateKey, grant.sender_public_material, grant.salt),
    raw = await openBytes(
      kek,
      grant.encrypted_record_key,
      `${grant.id}:${record.id}:${identity.owner_id}`,
      "grant-dek",
    );
  try {
    const dek = await aes(raw);
    return {
      metadata: await openJSON(
        dek,
        record.encrypted_metadata,
        record.id,
        "metadata",
      ),
      payload: await openJSON(
        dek,
        record.encrypted_payload,
        record.id,
        "payload",
      ),
    };
  } finally {
    raw.fill(0);
  }
}
// Files have independent DEKs. Never reuse a record grant as a file wrapper.
export async function createFileGrant(vmk,file,grant,verifiedPublicKey,expectedFingerprint){
  if(file.crypto_version!==CRYPTO_VERSION||grant.crypto_version!==CRYPTO_VERSION||grant.permissions!=='view'||grant.grant_version!==1||file.owner_id!==grant.owner_id||file.vault_id!==grant.vault_id||file.record_id!==grant.record_id||!grant.id||!grant.recipient_id||grant.recipient_id===file.owner_id)throw new Error('File grant identity mismatch.');
  await verifyRecipientKey(verifiedPublicKey,expectedFingerprint);
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const salt=encode(random(16)),raw=await openBytes(vmk,file.wrapped_file_dek,file.id,'file-dek');
  try{
    const kek=await sharedKey(ephemeral.privateKey,verifiedPublicKey,salt);
    return {grant_id:grant.id,file_id:file.id,record_id:file.record_id,owner_id:file.owner_id,vault_id:file.vault_id,recipient_id:grant.recipient_id,crypto_version:CRYPTO_VERSION,salt,sender_public_material:await crypto.subtle.exportKey('jwk',ephemeral.publicKey),encrypted_file_key:await sealBytes(kek,raw,`${grant.id}:${file.record_id}:${file.id}:${grant.recipient_id}`,'grant-file-dek')};
  }finally{raw.fill(0);}
}
export async function decryptGrantedDocument(recipientVMK,identity,grant,file,fileGrant,envelope){
  if(identity.owner_id!==grant.recipient_id||identity.crypto_version!==CRYPTO_VERSION||grant.crypto_version!==CRYPTO_VERSION||grant.permissions!=='view'||grant.grant_version!==1||file.crypto_version!==CRYPTO_VERSION||fileGrant.crypto_version!==CRYPTO_VERSION||fileGrant.grant_id!==grant.id||fileGrant.file_id!==file.id||fileGrant.record_id!==grant.record_id||file.record_id!==grant.record_id||fileGrant.recipient_id!==identity.owner_id||fileGrant.owner_id!==grant.owner_id||file.owner_id!==grant.owner_id||fileGrant.vault_id!==grant.vault_id||file.vault_id!==grant.vault_id)throw new Error('File grant identity mismatch.');
  const privateKey=await sharingPrivate(recipientVMK,identity),kek=await sharedKey(privateKey,fileGrant.sender_public_material,fileGrant.salt);
  const raw=await openBytes(kek,fileGrant.encrypted_file_key,`${grant.id}:${file.record_id}:${file.id}:${identity.owner_id}`,'grant-file-dek');
  try{
    const dek=await aes(raw);
    const metadata=await openJSON(dek,file.encrypted_filename,file.id,'filename');
    const bytes=await openBytes(dek,envelope,file.id,'file');
    return {...metadata,bytes};
  }finally{raw.fill(0);}
}
// Re-encrypting via encryptRecord generates a new DEK. Old grants cannot open
// that new version. A trusted server transaction must persist the record and
// replacement grants atomically; client-only access lists are not authorization.
