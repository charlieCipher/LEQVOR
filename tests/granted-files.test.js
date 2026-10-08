// @vitest-environment node
import {it,expect} from 'vitest';
import {createSharingIdentity,encryptDocument,createFileGrant,decryptGrantedDocument} from '../src/modules/security/v5Crypto.js';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys.js';
it('uses an independent recipient file key bound to grant, record, file and recipient',async()=>{
 const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const owner=await key(),recipient=await key(),identity=await createSharingIdentity(recipient,'recipient');
 const grant={id:'grant',record_id:'record',owner_id:'owner',vault_id:'vault',recipient_id:'recipient',crypto_version:'leqvor-v5',permissions:'view',grant_version:1};
 const sample=new TextEncoder().encode('PRIVATE_FILE_CONTENT');
 const file=await encryptDocument(owner,{record_id:'record',owner_id:'owner',vault_id:'vault',name:'PRIVATE_FILE_NAME',type:'text/plain',bytes:sample});
 const wrapped=await createFileGrant(owner,file.row,grant,identity.public_key,await recipientKeyFingerprint(identity.public_key));
 expect(JSON.stringify(wrapped)).not.toContain('PRIVATE_');expect(wrapped).not.toHaveProperty('wrapped_file_dek');
 const minimal={...file.row};delete minimal.wrapped_file_dek;
 const decoded=await decryptGrantedDocument(recipient,identity,grant,minimal,wrapped,file.envelope);
 expect(decoded.name).toBe('PRIVATE_FILE_NAME');expect(decoded.bytes).toEqual(sample);decoded.bytes.fill(0);
 for(const altered of [{...wrapped,grant_id:'other'},{...wrapped,file_id:'other'},{...wrapped,record_id:'other'},{...wrapped,recipient_id:'other'},{...wrapped,owner_id:'other'},{...wrapped,vault_id:'other'}])await expect(decryptGrantedDocument(recipient,identity,grant,minimal,altered,file.envelope)).rejects.toThrow();
 await expect(decryptGrantedDocument(await key(),identity,grant,minimal,wrapped,file.envelope)).rejects.toThrow();
 await expect(createFileGrant(owner,file.row,{...grant,grant_version:2},identity.public_key,await recipientKeyFingerprint(identity.public_key))).rejects.toThrow('mismatch');
 const changed={...file.envelope,ciphertext:file.envelope.ciphertext[0]==='A'?'B'+file.envelope.ciphertext.slice(1):'A'+file.envelope.ciphertext.slice(1)};
 await expect(decryptGrantedDocument(recipient,identity,grant,minimal,wrapped,changed)).rejects.toThrow();
});
