import { canonical, digest } from "./v5Crypto";
const bytes = (value) =>
  new TextEncoder().encode(JSON.stringify(canonical(value)));
const encode = (array) =>
  btoa(
    Array.from(new Uint8Array(array), (b) => String.fromCharCode(b)).join(""),
  );
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function createDeviceSigningKey() {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signVersion(
  privateKey,
  { record_id, version, previous_hash, ciphertext, created_at, crypto_version },
) {
  const commitment = {
    record_id,
    version,
    previous_hash,
    ciphertext_hash: await digest(ciphertext),
    created_at,
    crypto_version,
  };
  const version_hash = await digest(commitment),
    signature = encode(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        bytes({ ...commitment, version_hash }),
      ),
    );
  return { ...commitment, version_hash, signature };
}
// The record ID and checkpoint must come from a trusted caller-held anchor,
// never from the same untrusted response being verified.
export async function verifyVersionChain(publicKey, versions, checkpoint, expectedRecordId) {
  if (!Array.isArray(versions) || !versions.length || versions.length > 10000 ||
      typeof expectedRecordId !== 'string' || !expectedRecordId ||
      typeof checkpoint !== 'string' || !checkpoint) return false;
  try {
  let previous = null,
    index = 1;
  for (const version of versions) {
    const { signature, version_hash, ...commitment } = version;
    if (
      commitment.record_id !== expectedRecordId ||
      commitment.crypto_version !== 'leqvor-v5' ||
      !Number.isFinite(Date.parse(commitment.created_at)) ||
      typeof signature !== 'string' || signature.length !== 88 ||
      typeof commitment.ciphertext_hash !== 'string' || commitment.ciphertext_hash.length !== 44 ||
      typeof version_hash !== 'string' || version_hash.length !== 44 ||
      commitment.version !== index++ ||
      commitment.previous_hash !== previous ||
      (await digest(commitment)) !== version_hash
    )
      return false;
    if (
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        decode(signature),
        bytes({ ...commitment, version_hash }),
      ))
    )
      return false;
    previous = version_hash;
  }
  return checkpoint ? previous === checkpoint : false;
  } catch {
    // Malformed network data and invalid signatures are verification failures,
    // not errors that may accidentally bypass a caller's verification gate.
    return false;
  }
}
