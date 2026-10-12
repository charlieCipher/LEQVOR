// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createDisposableDatabase} from '../scripts/check-database.mjs';
import {createVaultEnvelope,generateRecoverySecret,unlockVault,encryptRecord,decryptRecordPayload,encryptDocument,decryptDocument} from '../src/modules/security/v5Crypto';
import {createReviewSigningIdentity} from '../src/modules/security/reviewSignatures';
import {signSecurityEvent,verifySecurityEventChain} from '../src/modules/security/securityEventSignatures';
it('restores the full local database with encrypted keys, signed history and revoked-device state intact',async()=>{
 let source=await createDisposableDatabase(),restored,key,directory,phrase=generateRecoverySecret();
 try{
  const owner=crypto.randomUUID(),other=crypto.randomUUID(),device=crypto.randomUUID();
  const vault={...await createVaultEnvelope(owner,'synthetic restore password only',phrase),recovery_verified_at:new Date().toISOString()};
  key=await unlockVault(vault,phrase,true);
  const record=await encryptRecord(key,{owner_id:owner,vault_id:vault.id,metadata:{title:'RESTORE_CANARY'},payload:{instructions:'RESTORE_CANARY'}});
  const person=await encryptRecord(key,{owner_id:owner,vault_id:vault.id,metadata:{title:'RESTORE_PERSON_CANARY'},payload:{roles:['beneficiary']}});
  const edge=await encryptRecord(key,{owner_id:owner,vault_id:vault.id,metadata:{title:'RESTORE_EDGE_CANARY'},payload:{role:'beneficiary',review_due:'2027-01-01'}});
  const file=await encryptDocument(key,{owner_id:owner,vault_id:vault.id,record_id:record.id,name:'RESTORE_FILE_CANARY.txt',type:'text/plain',bytes:new TextEncoder().encode('RESTORE_FILE_CONTENT_CANARY')});
  const identity=await createReviewSigningIdentity(key,owner,vault.id),payload=await decryptRecordPayload(key,identity);
  const signer=await crypto.subtle.importKey('jwk',payload.private_key,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);payload.private_key.d='';
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);const {kty,crv,x,y}=await crypto.subtle.exportKey('jwk',pair.publicKey),deviceKey={kty,crv,x,y};
  const event=await signSecurityEvent(signer,{id:crypto.randomUUID(),owner_id:owner,sequence:1,event_type:'DEVICE_REVOKED',severity:'INFO',device_id:device,previous_hash:null,created_at:new Date().toISOString(),signing_key_id:identity.id});
  await source.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  for(const [table,row] of [['vaults',vault],['records',record],['trusted_people',person],['record_files',file.row],['review_signing_keys',identity]]){
   const columns=Object.keys(row);await source.query(`insert into public.${table} (${columns.join(',')}) values (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
  }
  await source.query("insert into public.continuity_entities(id,owner_id,vault_id,entity_type,record_id) values($1,$2,$3,'POLICY',$1)",[record.id,owner,vault.id]);
  await source.query("insert into public.continuity_entities(id,owner_id,vault_id,entity_type,person_id) values($1,$2,$3,'PERSON',$1)",[person.id,owner,vault.id]);
  await source.query('insert into public.continuity_edges(id,owner_id,vault_id,from_entity_id,to_entity_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[edge.id,owner,vault.id,record.id,person.id,edge.encrypted_metadata,edge.encrypted_payload,edge.wrapped_dek,edge.crypto_version]);
  const grant=crypto.randomUUID();
  await source.query("insert into public.record_grants(id,record_id,owner_id,vault_id,recipient_id,encrypted_record_key,sender_public_material,permissions,grant_version,status,revoked_at,crypto_version,salt,record_revision,record_snapshot,expires_at) values($1,$2,$3,$4,$5,$6,$7,'view',1,'revoked',now(),'leqvor-v5',$8,1,$9,now()+interval '1 day')",[grant,record.id,owner,vault.id,other,record.wrapped_dek,deviceKey, btoa('synthetic-salt-16'),{...record,revision:1}]);
  await source.query('insert into public.vault_devices(id,owner_id,vault_id,public_key,revoked_at) values($1,$2,$3,$4,now())',[device,owner,vault.id,deviceKey]);
  const row={...event,encrypted_details:null,signature:{domain:'leqvor-security-event-v1',signing_key_id:identity.id,value:event.signature}};delete row.signing_key_id;
  const columns=Object.keys(row);await source.query(`insert into public.security_events (${columns.join(',')}) values (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
  directory=await mkdtemp(join(tmpdir(),'leqvor-full-restore-'));
  const cleanupTarget=resolve(directory);if(dirname(cleanupTarget)!==resolve(tmpdir())||!basename(cleanupTarget).startsWith('leqvor-full-restore-')){directory=null;throw new Error('Invalid restore cleanup target.');}
  const snapshot=await source.dumpDataDir();
  await writeFile(join(directory,'database.tar.gz'),new Uint8Array(await snapshot.arrayBuffer()),{flag:'wx',mode:0o600});
  const objectJson=JSON.stringify(file.envelope);expect(objectJson).not.toContain('RESTORE_FILE_CONTENT_CANARY');expect(objectJson).not.toContain(phrase);
  await writeFile(join(directory,'encrypted-object.json'),objectJson,{flag:'wx',mode:0o600});
  await source.close();source=null;key=null;
  restored=new PGlite({loadDataDir:new Blob([await readFile(join(directory,'database.tar.gz'))])});await restored.waitReady;
  const restoredVault=(await restored.query('select * from public.vaults where id=$1',[vault.id])).rows[0];key=await unlockVault(restoredVault,phrase,true);
  const restoredRecord=(await restored.query('select * from public.records where id=$1',[record.id])).rows[0];expect((await decryptRecordPayload(key,restoredRecord)).instructions).toBe('RESTORE_CANARY');
  const restoredEdge=(await restored.query('select * from public.continuity_edges where id=$1',[edge.id])).rows[0];expect((await decryptRecordPayload(key,restoredEdge)).role).toBe('beneficiary');
  expect((await restored.query('select * from public.continuity_entities')).rows).toHaveLength(2);
  expect((await restored.query('select * from public.record_revision_history where record_id=$1',[record.id])).rows).toHaveLength(1);
  const restoredFile=(await restored.query('select * from public.record_files where id=$1',[file.row.id])).rows[0],restoredObject=JSON.parse(await readFile(join(directory,'encrypted-object.json'),'utf8'));
  expect(new TextDecoder().decode((await decryptDocument(key,restoredFile,restoredObject)).bytes)).toBe('RESTORE_FILE_CONTENT_CANARY');
  const tampered=structuredClone(restoredObject);tampered.ciphertext=(tampered.ciphertext[0]==='A'?'B':'A')+tampered.ciphertext.slice(1);await expect(decryptDocument(key,restoredFile,tampered)).rejects.toThrow();
  expect((await restored.query('select status from public.record_grants where id=$1',[grant])).rows[0].status).toBe('revoked');
  const rows=(await restored.query('select * from public.security_events order by sequence')).rows.map(r=>({id:r.id,owner_id:r.owner_id,sequence:r.sequence,event_type:r.event_type,severity:r.severity,device_id:r.device_id,previous_hash:r.previous_hash,event_hash:r.event_hash,created_at:new Date(r.created_at).toISOString(),signing_key_id:r.signature.signing_key_id,signature:r.signature.value}));
  expect(await verifySecurityEventChain(rows,{owner_id:owner,pins:{[identity.id]:identity.public_key},checkpoint:{sequence:1,event_hash:event.event_hash}})).toBe(true);
  expect((await restored.query('select revoked_at from public.vault_devices where id=$1',[device])).rows[0].revoked_at).toBeTruthy();
  await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await restored.exec('set role authenticated');expect((await restored.query('select * from public.vault_devices')).rows).toEqual([]);expect((await restored.query('select * from public.security_events')).rows).toEqual([]);await restored.exec('reset role');
  await restored.exec('set role authenticated');
  for(const table of ['records','record_files','trusted_people','continuity_entities','continuity_edges','record_revision_history'])expect((await restored.query(`select * from public.${table}`)).rows).toEqual([]);
  await expect(restored.query('select public.read_v5_share($1)',[grant])).rejects.toMatchObject({code:'42501'});await restored.exec('reset role');
  await restored.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner,JSON.stringify({role:'authenticated',session_id:crypto.randomUUID(),aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]})]);await restored.exec('set role authenticated');
  await expect(restored.query("select public.begin_v5_device_challenge($1,$2,'verify',$3)",[vault.id,device,deviceKey])).rejects.toMatchObject({code:'42501'});
 }finally{key=null;phrase='';await source?.close();await restored?.close();if(directory)await rm(resolve(directory),{recursive:true,force:true});}
},60000);
