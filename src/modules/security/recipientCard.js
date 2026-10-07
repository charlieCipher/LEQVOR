import { verifyRecipientKey } from './recipientKeys';
import { AurevaError } from './safeEvents';

// The card never supplies its own trust pin. Compare a fingerprint obtained
// independently from the recipient, then store the binding inside the vault.
export async function verifyRecipientCard(text, fingerprint, ownerId) {
  try {
    if (typeof text !== 'string' || text.length > 2048) throw new Error();
    const card = JSON.parse(text);
    if (card.version !== 'leqvor-recipient-v1' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card.owner_id) ||
        card.owner_id === ownerId || Object.keys(card).some(k => !['version','owner_id','public_key'].includes(k))) throw new Error();
    await verifyRecipientKey(card.public_key, fingerprint);
    const {kty, crv, x, y} = card.public_key;
    return {account_id:card.owner_id, public_key:{kty,crv,x,y}, fingerprint, verified_at:new Date().toISOString()};
  } catch {
    throw new AurevaError('RECIPIENT_VERIFICATION_FAILED', 'The sharing card or fingerprint does not match. Confirm both with your trusted person before saving.');
  }
}
