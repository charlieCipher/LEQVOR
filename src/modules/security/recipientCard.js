import { verifyRecipientKey } from './recipientKeys';
import { AurevaError } from './safeEvents';
import {reviewPublicKey} from './reviewSignatures';
import {opaqueId} from '../continuity/verificationPolicy';

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
export async function verifyReviewCard(text,fingerprint,accountId){
 try{
  if(typeof text!=='string'||text.length>2048)throw new Error();
  const card=JSON.parse(text);opaqueId(card.owner_id);opaqueId(card.key_id);
  if(card.version!=='leqvor-reviewer-v1'||card.owner_id!==accountId||Object.keys(card).some(k=>!['version','owner_id','key_id','public_key'].includes(k)))throw new Error();
  await reviewPublicKey(card.public_key);await verifyRecipientKey(card.public_key,fingerprint);
  const {kty,crv,x,y}=card.public_key;
  return {account_id:card.owner_id,key_id:card.key_id,public_key:{kty,crv,x,y},fingerprint,verified_at:new Date().toISOString()};
 }catch{throw new AurevaError('REVIEWER_VERIFICATION_FAILED','Confirm the reviewer account and signing-key fingerprint separately before saving.');}
}
