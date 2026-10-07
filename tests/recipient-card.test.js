// @vitest-environment node
import {it,expect} from 'vitest';
import {verifyRecipientCard} from '../src/modules/security/recipientCard';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys';
const owner='11111111-1111-4111-8111-111111111111';
const recipient='22222222-2222-4222-8222-222222222222';
async function fixture(){
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const public_key=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {card:{version:'leqvor-recipient-v1',owner_id:recipient,public_key},pin:await recipientKeyFingerprint(public_key)};
}
it('binds an independently verified key to the recipient account',async()=>{
 const {card,pin}=await fixture();
 const binding=await verifyRecipientCard(JSON.stringify(card),pin,owner);
 expect(binding).toMatchObject({account_id:recipient,fingerprint:pin});
 expect(Object.keys(binding.public_key).sort()).toEqual(['crv','kty','x','y']);
});
it('rejects substituted keys, self recipients, malformed cards and card-supplied pins',async()=>{
 const {card,pin}=await fixture(),other=await fixture();
 for(const [value,fingerprint] of [[card,other.pin],[{...card,owner_id:owner},pin],[{...card,fingerprint:pin},pin],[{...card,public_key:{...card.public_key,d:'secret'}},pin],[card,''],[null,pin]])
  await expect(verifyRecipientCard(JSON.stringify(value),fingerprint,owner)).rejects.toMatchObject({code:'RECIPIENT_VERIFICATION_FAILED'});
 await expect(verifyRecipientCard('x'.repeat(2049),pin,owner)).rejects.toThrow();
});
