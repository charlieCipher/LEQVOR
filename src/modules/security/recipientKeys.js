// RFC 7638: thumbprints cover only crv, kty, x, y, in lexicographic order.
// https://www.rfc-editor.org/rfc/rfc7638.html#section-3.2
// A matching fingerprint identifies a key, not a person. Callers must obtain
// the expected fingerprint through independent recipient verification and keep
// that pin in owner-encrypted data, not accept it alongside an untrusted key.
export async function recipientKeyFingerprint(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || 'd' in jwk ||
      !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y))
    throw new Error('Invalid recipient public key.');
  const publicJwk = {crv:jwk.crv, kty:jwk.kty, x:jwk.x, y:jwk.y};
  // Import rejects coordinates that are not a valid point. Export enforces the
  // canonical base64url representation, including otherwise unused pad bits.
  const key = await crypto.subtle.importKey('jwk', publicJwk, {name:'ECDH', namedCurve:'P-256'}, true, []);
  const normalized = await crypto.subtle.exportKey('jwk', key);
  if (normalized.x !== jwk.x || normalized.y !== jwk.y) throw new Error('Invalid recipient public key.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(publicJwk)));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function verifyRecipientKey(jwk, expectedFingerprint) {
  if (typeof expectedFingerprint !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(expectedFingerprint))
    throw new Error('Verify the recipient key before sharing.');
  if (await recipientKeyFingerprint(jwk) !== expectedFingerprint)
    throw new Error('Recipient key changed. Verify the recipient again before sharing.');
}
