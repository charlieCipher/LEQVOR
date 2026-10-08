// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {SharingService} from '../src/modules/continuity/SharingService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {createSharingIdentity,encryptRecord} from '../src/modules/security/v5Crypto';
import {recipientKeyFingerprint} from '../src/modules/security/recipientKeys';

it('shares only a selected DEK, decrypts the saved revision and rejects identity/key substitution',async()=>{
 const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const a=await key(),b=await key(),identity=await createSharingIdentity(b,'recipient');identity.vault_id='recipient-vault';
 const pin=await recipientKeyFingerprint(identity.public_key);
 const owner=new VaultSession(),recipient=new VaultSession();owner.unlock(a);recipient.unlock(b);
 const vault={id:'owner-vault',owner_id:'owner'};
 const record={...await encryptRecord(a,{id:'record',owner_id:'owner',vault_id:vault.id,metadata:{title:'PRIVATE_TITLE'},payload:{instructions:'PRIVATE_INSTRUCTIONS'}}),revision:1};
 const person={owner_id:'owner',vault_id:vault.id,recipient_binding:{account_id:'recipient',public_key:identity.public_key,fingerprint:pin,verified_at:'2026-10-09'}};
 let bundle;const db={inviteShare:vi.fn(async(grant,revision)=>{bundle={grant,record:{...record,wrapped_dek:undefined,revision}};return grant.id;})};
 const source=new SharingService(owner,vault,db);
 const receiver=new SharingService(recipient,{id:'recipient-vault',owner_id:'recipient'},{sharingIdentity:async()=>identity,readShare:async()=>bundle});
 try{
  const id=await source.invite(record,person);
  expect(JSON.stringify(db.inviteShare.mock.calls[0])).not.toContain('PRIVATE_');
  expect(await receiver.reveal(id)).toMatchObject({metadata:{title:'PRIVATE_TITLE'},payload:{instructions:'PRIVATE_INSTRUCTIONS'},revision:1});
  await expect(source.invite(record,{...person,recipient_binding:{...person.recipient_binding,fingerprint:'A'.repeat(43)}})).rejects.toThrow();
  await expect(source.invite(record,{...person,recipient_binding:null})).rejects.toThrow('independently');
  expect(()=>source.invite({...record,owner_id:'foreign'},person)).toThrow();
  bundle.grant.recipient_id='other';await expect(receiver.reveal(id)).rejects.toThrow('mismatch');
  recipient.lock();await expect(receiver.reveal(id)).rejects.toThrow('Unlock');
 }finally{owner.dispose();recipient.dispose();}
});
