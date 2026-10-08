// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {V5VaultService} from '../src/modules/vault/V5VaultService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {encryptRecord,decryptRecordMetadata,decryptRecordPayload} from '../src/modules/security/v5Crypto';
it('encrypts profile edits, preserves recipient identity and payload, and supplies a stale-write guard',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const session=new VaultSession();session.unlock(key);
 const vault={id:'vault',owner_id:'owner'},binding={owner_id:'recipient',fingerprint:'UNCHANGED_BINDING'};
 const person={...await encryptRecord(key,{id:'person',owner_id:'owner',vault_id:'vault',metadata:{display_name:'Before',recipient_binding:binding},payload:{notes:'PRIVATE_NOTES'}}),status:'unverified'};
 const db={updatePerson:vi.fn(async row=>row)},service=new V5VaultService(session,vault,db);
 try{
  const saved=await service.updatePerson(person,{display_name:'PRIVATE_NEW_NAME',professional_details:{organization:'PRIVATE_FIRM',status:'FORMER'}});
  const [wire,nonce]=db.updatePerson.mock.calls[0];
  expect(nonce).toBe(person.encrypted_metadata.nonce);
  expect(JSON.stringify(wire)).not.toContain('PRIVATE_');
  expect(await decryptRecordMetadata(key,saved)).toMatchObject({display_name:'PRIVATE_NEW_NAME',recipient_binding:binding});
  expect(await decryptRecordPayload(key,saved)).toEqual({notes:'PRIVATE_NOTES'});
  await expect(service.updatePerson(person,{recipient_binding:{}})).rejects.toThrow('Unsupported');
  await expect(service.updatePerson({...person,owner_id:'foreign'},{display_name:'Other'})).rejects.toThrow();
  await expect(service.updatePerson({...person,status:'verified'},{display_name:'Other'})).rejects.toThrow();
  db.updatePerson.mockRejectedValueOnce({code:'PGRST116'});
  await expect(service.updatePerson(person,{display_name:'Other'})).rejects.toThrow('contact changed');
  session.lock();await expect(service.updatePerson(person,{display_name:'Other'})).rejects.toThrow();
 }finally{session.dispose();}
});
