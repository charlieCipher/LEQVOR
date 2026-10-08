// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {SharingService} from '../src/modules/continuity/SharingService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {createSharingIdentity,encryptRecord,encryptDocument} from '../src/modules/security/v5Crypto';
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

it('atomically invites selected encrypted attachments and decrypts only on the recipient client',async()=>{
 const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const a=await key(),b=await key(),identity=await createSharingIdentity(b,'recipient');identity.vault_id='recipient-vault';
 const owner=new VaultSession(),recipient=new VaultSession();owner.unlock(a);recipient.unlock(b);
 const vault={id:'vault',owner_id:'owner'},record={...await encryptRecord(a,{id:'record',owner_id:'owner',vault_id:'vault',metadata:{title:'Document'},payload:{notes:'PRIVATE_NOTE'}}),revision:1};
 const document=await encryptDocument(a,{record_id:'record',owner_id:'owner',vault_id:'vault',name:'PRIVATE_NAME',type:'text/plain',bytes:new TextEncoder().encode('PRIVATE_CONTENT')});
 const person={owner_id:'owner',vault_id:'vault',recipient_binding:{account_id:'recipient',public_key:identity.public_key,fingerprint:await recipientKeyFingerprint(identity.public_key),verified_at:'2026-10-09'}};
 let bundle;const db={inviteShare:vi.fn(),inviteShareWithFiles:vi.fn(async(grant,_revision,_public,files)=>{bundle={grant,file:{...document.row,wrapped_file_dek:undefined},file_grant:files[0]};return grant.id;})};
 const source=new SharingService(owner,vault,db);
 const receiver=new SharingService(recipient,{id:'recipient-vault',owner_id:'recipient'},{sharingIdentity:async()=>identity,readSharedFile:async()=>bundle,downloadSharedFile:async()=>document.envelope});
 try{
  const id=await source.invite(record,person,[document.row]);expect(db.inviteShare).not.toHaveBeenCalled();
  expect(JSON.stringify(db.inviteShareWithFiles.mock.calls)).not.toContain('PRIVATE_');
  const file=await receiver.download(id,document.row.id);expect(file.name).toBe('PRIVATE_NAME');expect(new TextDecoder().decode(file.bytes)).toBe('PRIVATE_CONTENT');file.bytes.fill(0);
  await expect(source.invite(record,person,[{...document.row,record_id:'other'}])).rejects.toThrow('mismatch');
  expect(db.inviteShareWithFiles).toHaveBeenCalledTimes(1);
  expect(()=>source.invite(record,person,Array(21).fill(document.row))).toThrow('selected');
  recipient.lock();await expect(receiver.download(id,document.row.id)).rejects.toThrow('Unlock');
 }finally{owner.dispose();recipient.dispose();}
});
