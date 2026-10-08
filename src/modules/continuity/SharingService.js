import {createRecordGrant,decryptGrantedRecord,verifySharingIdentity} from '../security/v5Crypto';
import {verifyRecipientKey} from '../security/recipientKeys';
import {AurevaError} from '../security/safeEvents';

export class SharingService {
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 list(){return this.session.run(async(_key,active)=>{const rows=await this.db.listShares();active();return rows;});}
 invite(record,person){
  if(record.owner_id!==this.vault.owner_id||record.vault_id!==this.vault.id||person.owner_id!==this.vault.owner_id||person.vault_id!==this.vault.id)throw new Error('Sharing identity mismatch.');
  return this.session.run(async(key,active)=>{
   const binding=person.recipient_binding;
   if(!binding?.account_id||!binding?.verified_at)throw new AurevaError('RECIPIENT_REQUIRED','Add this person using their independently confirmed sharing card and fingerprint first.');
   await verifyRecipientKey(binding.public_key,binding.fingerprint);
   const grant=await createRecordGrant(key,record,binding.account_id,binding.public_key,binding.fingerprint);
   active();
   const id=await this.db.inviteShare(grant,record.revision,binding.public_key);
   active();return id;
  });
 }
 accept(id){return this.session.run(async(_key,active)=>{await this.db.acceptShare(id);active();});}
 revoke(id){return this.session.run(async(_key,active)=>{await this.db.revokeShare(id);active();});}
 reveal(id){return this.session.run(async(key,active)=>{
  const [identity,bundle]=await Promise.all([this.db.sharingIdentity(),this.db.readShare(id)]);
  active();
  if(!identity||identity.owner_id!==this.vault.owner_id||identity.vault_id!==this.vault.id)throw new Error('Recipient identity unavailable.');
  await verifySharingIdentity(key,identity);
  const result=await decryptGrantedRecord(key,identity,bundle.grant,bundle.record);
  active();return {...result,revision:bundle.record.revision};
 });}
}
