// Disposable PostgreSQL engine. No credentials, network or production target.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export async function createDisposableDatabase() {
 const db = new PGlite();
 try {
  // Minimal auth/storage contracts for schema tests; not a Supabase emulator.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  `);
  for (const name of ['20260911_continuity_v5.sql', '20260913_record_transactions.sql', '20260927_ciphertext_envelopes.sql', '20261006_sharing_identity.sql', '20261008_continuity_graph.sql', '20261008_asset_workflow.sql', '20261008_document_workflow.sql', '20261009_selected_sharing.sql', '20261009_shared_files.sql', '20261009_trigger_planning.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  return db;
 } catch (error) { await db.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
let db;
try {
  db = await createDisposableDatabase();
  for (const name of ['v5_isolation.sql', 'record_transactions.sql', 'ciphertext_envelopes.sql', 'sharing_identity.sql', 'hosted_rollback_acceptance.sql', 'continuity_graph.sql', 'asset_workflow.sql', 'document_history.sql', 'selected_sharing.sql', 'shared_files.sql', 'trigger_planning.sql']) {
    await db.exec(await readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS PostgreSQL ${name}`);
  }
  const readiness = await db.exec(await readFile(new URL('../supabase/tests/v5_schema_readiness.sql', import.meta.url), 'utf8'));
  const gates = readiness.flatMap(result => result.rows).filter(row => Object.hasOwn(row, 'ready'));
  if (gates.length < 18 || gates.some(row => row.ready !== true)) throw new Error('Schema readiness failed');
  console.log('PASS PostgreSQL schema readiness (historical validation remains a deployment gate)');
} catch (error) {
  // PostgreSQL errors may include failing row contents. Never print them.
  console.error(`Database checks failed (${error.code || 'runner error'}).`);
  process.exitCode = 1;
} finally { await db?.close(); }
}
