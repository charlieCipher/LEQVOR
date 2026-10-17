// @vitest-environment node
import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createDisposableDatabase} from '../scripts/check-database.mjs';

it('reproduces password-only record deletion then closes direct and definer MFA bypasses',async()=>{
 const db=await createDisposableDatabase();
 try {
  const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
  const vault='30000000-0000-4000-8000-000000000003',record='40000000-0000-4000-8000-000000000004';
  const envelope=JSON.stringify({crypto_version:'leqvor-v5',algorithm:'AES-256-GCM',aad_version:1,nonce:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAA=='});
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await db.query("insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values($1,$2,$3,$3,'fixture','{}','fixture','leqvor-v5',now())",[vault,owner,envelope]);
  const row={id:record,owner_id:owner,vault_id:vault,encrypted_metadata:JSON.parse(envelope),encrypted_payload:JSON.parse(envelope),wrapped_dek:JSON.parse(envelope),crypto_version:'leqvor-v5'};
  await db.query("insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values($1,$2,$3,$4,$4,$4,'leqvor-v5')",[record,owner,vault,envelope]);
  await db.query("insert into auth.mfa_factors(id,user_id,status) values(gen_random_uuid(),$1,'verified')",[owner]);
  // Reproduce the hosted legacy schema's user_id/id ownership conventions.
  await db.exec(`create table public.assets(id uuid primary key,user_id uuid);
   create table public.profiles(id uuid primary key);
   alter table public.assets enable row level security;alter table public.profiles enable row level security;
   grant select,insert,delete on public.assets,public.profiles to authenticated;
   create policy owner on public.assets for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
   create policy owner on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());`);
  await db.query('insert into public.assets values($1,$2)',[record,owner]);
  await db.query('insert into public.profiles values($1)',[owner]);
  const identity=async(subject,aal)=>{
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[subject,JSON.stringify({role:'authenticated',aal})]);
   await db.exec('set role authenticated');
  };
  await identity(owner,'aal1');
  // A real successful mutation under the historical schema, rolled back locally.
  await db.exec('begin');
  await db.query('select public.delete_v5_record($1,1)',[record]);
  expect((await db.query('select count(*)::int as n from public.records')).rows[0].n).toBe(0);
  await db.exec('rollback;reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/20261016_customer_mfa_boundary.sql',import.meta.url),'utf8'));
  await identity(owner,'aal1');
  expect((await db.query('select count(*)::int as n from public.records')).rows[0].n).toBe(0);
  await expect(db.query('select public.delete_v5_record($1,1)',[record])).rejects.toMatchObject({code:'42501'});
  await expect(db.query('select public.update_v5_record($1,1,$2)',[record,JSON.stringify(row)])).rejects.toMatchObject({code:'42501'});
  for(const table of ['assets','profiles'])expect((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(0);
  await identity(owner,undefined);
  await expect(db.query('select public.delete_v5_record($1,1)',[record])).rejects.toMatchObject({code:'42501'});
  await expect(db.query('delete from public.vaults where id=$1',[vault])).resolves.toMatchObject({affectedRows:0});
  await expect(db.query('select public.read_v5_share($1)',[record])).rejects.toMatchObject({code:'42501'});
  await expect(db.query('select public.read_v5_trigger_review($1)',[record])).rejects.toMatchObject({code:'42501'});
  await expect(db.query("insert into storage.objects(bucket_id,name) values('vault-v5',$1)",[`${owner}/${record}/${record}`])).rejects.toMatchObject({code:'42501'});
  await identity(other,'aal2');
  await expect(db.query('select public.delete_v5_record($1,1)',[record])).rejects.toMatchObject({code:'42501'});
  await identity(owner,'aal2');
  expect((await db.query('select count(*)::int as n from public.records')).rows[0].n).toBe(1);
  for(const table of ['assets','profiles'])expect((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(1);
  await db.query('select public.update_v5_record($1,1,$2)',[record,JSON.stringify(row)]);
  await db.query('select public.delete_v5_record($1,2)',[record]);
  expect((await db.query('select count(*)::int as n from public.records')).rows[0].n).toBe(0);
  // An account without MFA retains existing password-only access.
  await identity(other,'aal1');
  expect((await db.query('select public.v5_customer_mfa_allowed() as allowed')).rows[0].allowed).toBe(true);
 } finally {await db.close();}
});

it('preserves existing owner, sharing, file and verified-device contracts with the new guard',async()=>{
 const db=await createDisposableDatabase();
 try {
  await db.exec(await readFile(new URL('../supabase/migrations/20261016_customer_mfa_boundary.sql',import.meta.url),'utf8'));
  for(const name of ['v5_isolation','record_sharing_conflicts','selected_sharing','shared_files','review_delivery','signed_security_history','verified_devices','vault_password_guard']) {
   // The current schema deliberately replaced retryable 40001 with PT409.
   // Keep the historical sharing scenarios, using today's conflict contract.
   let sql=(await readFile(new URL(`../supabase/tests/${name}.sql`,import.meta.url),'utf8')).replaceAll('when serialization_failure',"when sqlstate 'PT409'");
   // This historical success case previously deleted after returning from an
   // unrelated aal1 session. The enrolled owner must now complete MFA first.
   sql=sql.replace("perform set_config('request.jwt.claim.sub',a::text,true);perform public.delete_v5_record(r,2);",
    "perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims','{\"aal\":\"aal2\"}',true);perform public.delete_v5_record(r,2);");
   if(name==='signed_security_history')sql=sql.replace("perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';",
    "perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims','{\"aal\":\"aal2\"}',true);execute 'set local role authenticated';");
   try {await db.exec(sql);} catch(error) {throw new Error(`MFA compatibility: ${name} (${error.code || 'failed'}): ${error.message} ${error.where || ''}`);}
  }
 }finally{await db.close();}
});
