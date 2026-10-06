// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { recipientKeyFingerprint, verifyRecipientKey } from '../src/modules/security/recipientKeys.js';
import { createRecordGrant } from '../src/modules/security/v5Crypto.js';

async function pair() {
  const keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  return crypto.subtle.exportKey('jwk',keys.publicKey);
}
it('matches the RFC 7638 SHA-256 thumbprint independently of optional JWK metadata',async()=>{
  const key=await pair();
  const expected=createHash('sha256').update(JSON.stringify({crv:key.crv,kty:key.kty,x:key.x,y:key.y})).digest('base64url');
  expect(await recipientKeyFingerprint(key)).toBe(expected);
  expect(await recipientKeyFingerprint({...key,kid:'untrusted-label',use:'enc'})).toBe(expected);
  await expect(verifyRecipientKey(key,expected)).resolves.toBeUndefined();
});
it('rejects missing pins, substituted keys, private keys and invalid points',async()=>{
  const key=await pair(), other=await pair(), pin=await recipientKeyFingerprint(key);
  await expect(verifyRecipientKey(other,pin)).rejects.toThrow('changed');
  await expect(verifyRecipientKey(key)).rejects.toThrow('Verify');
  for(const candidate of [null, {...key,d:'private'}, {...key,crv:'P-384'}, {...key,x:'A'.repeat(43),y:'A'.repeat(43)}])
    await expect(recipientKeyFingerprint(candidate)).rejects.toThrow();
});
it('rejects unverified sharing before attempting to unwrap a record key',async()=>{
  const key=await pair();
  await expect(createRecordGrant(null,{owner_id:'owner'},'recipient',key)).rejects.toThrow('Verify');
  await expect(createRecordGrant(null,{owner_id:'owner'},'owner',key)).rejects.toThrow('Invalid recipient');
});
