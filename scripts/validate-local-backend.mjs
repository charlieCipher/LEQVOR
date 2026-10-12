// Disposable loopback Supabase only. Never accepts a production target.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createVaultEnvelope, generateRecoverySecret, unlockVault, encryptRecord,
  decryptRecordPayload, encryptDocument, decryptDocument } from '../src/modules/security/v5Crypto.js';
import { cleanupBatch } from './ciphertext-cleanup.mjs';

const config = JSON.parse(await readFile('.local-backend-validation/status.json', 'utf8'));
const url = new URL(config.API_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '54321');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url.href, config.SERVICE_ROLE_KEY, options);
const clients = [], users = [];
const pass = label => console.log(`PASS ${label}`);
async function value(request) { const { data, error } = await request; if (error) throw new Error(`Request failed (${error.code || error.status || 'unknown'})`); return data; }
try {
  for (const label of ['a', 'b']) {
    const email = `leqvor-${label}-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomUUID() + crypto.randomUUID();
    const created = await value(admin.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.user.id);
    const client = createClient(url.href, config.ANON_KEY, options);
    await value(client.auth.signInWithPassword({ email, password }));
    clients.push(client);
  }
  pass('two disposable authenticated accounts');
  const [a, b] = clients;
  const phrase = generateRecoverySecret();
  const vault = { ...await createVaultEnvelope(users[0], 'synthetic vault password only', phrase), recovery_verified_at: new Date().toISOString() };
  await value(a.from('vaults').insert(vault));
  const storedVault = await value(a.from('vaults').select('*').eq('id', vault.id).single());
  const key = await unlockVault(storedVault, phrase, true);
  pass('vault creation, persistence and recovery unlock');
  const row = await encryptRecord(key, { owner_id: users[0], vault_id: vault.id, metadata: { title: 'PRIVATE_CANARY' }, payload: { notes: 'PRIVATE_CANARY' } });
  const file = await encryptDocument(key, { owner_id: users[0], vault_id: vault.id, record_id: row.id, name: 'private.txt', type: 'text/plain', bytes: new TextEncoder().encode('PRIVATE_CANARY') });
  await value(a.storage.from('vault-v5').upload(file.row.storage_path, new Blob([JSON.stringify(file.envelope)], { type: 'application/json' }), { contentType: 'application/json', upsert: false }));
  const saved = await value(a.rpc('save_v5_record_bundle', { record_data: row, file_data: file.row }));
  assert.equal(saved.revision, 1);
  const persisted = await value(a.from('records').select('*').eq('id', row.id).single());
  assert.ok(!JSON.stringify(persisted).includes('PRIVATE_CANARY'));
  assert.equal((await decryptRecordPayload(key, persisted)).notes, 'PRIVATE_CANARY');
  const blob = await value(a.storage.from('vault-v5').download(file.row.storage_path));
  const downloaded = await decryptDocument(key, file.row, JSON.parse(await blob.text()));
  assert.equal(new TextDecoder().decode(downloaded.bytes), 'PRIVATE_CANARY');
  downloaded.bytes.fill(0);
  pass('encrypted record/file persistence, explicit decryption and download');
  for (const table of ['vaults', 'records', 'record_files']) {
    const rows = await value(b.from(table).select('*').eq('owner_id', users[0]));
    assert.equal(rows.length, 0);
  }
  assert.ok((await b.storage.from('vault-v5').download(file.row.storage_path)).error);
  assert.ok((await b.rpc('update_v5_record', { target_id: row.id, expected_revision: 1, record_data: row })).error);
  assert.ok((await b.rpc('delete_v5_record', { target_id: row.id, expected_revision: 1 })).error);
  assert.ok((await b.from('records').insert({ ...row, id: crypto.randomUUID() })).error);
  pass('account B denied account A vault, record, file, update, delete and impersonated insert');
  const revised = await encryptRecord(key, { id: row.id, owner_id: users[0], vault_id: vault.id, metadata: { title: 'Revised' }, payload: { notes: 'Revised' } });
  const updated = await value(a.rpc('update_v5_record', { target_id: row.id, expected_revision: 1, record_data: revised }));
  assert.equal(updated.revision, 2);
  assert.equal((await decryptRecordPayload(key, updated)).notes, 'Revised');
  assert.equal((await a.rpc('update_v5_record', { target_id: row.id, expected_revision: 1, record_data: revised })).error?.code, 'PT409');
  pass('encrypted edit and stale revision rejection');
  await value(a.rpc('delete_v5_record', { target_id: row.id, expected_revision: 2 }));
  assert.equal((await value(a.from('records').select('*').eq('id', row.id))).length, 0);
  assert.equal((await value(a.from('record_files').select('*').eq('record_id', row.id))).length, 0);
  const cleanup = await cleanupBatch({ url: url.href, key: config.SERVICE_ROLE_KEY });
  assert.equal(cleanup.failed, 0);
  assert.ok(cleanup.completed >= 1);
  assert.ok((await a.storage.from('vault-v5').download(file.row.storage_path)).error);
  pass('transactional deletion, queued cleanup and object removal');
} catch (error) {
  console.error('FAIL', error.code || error.message);
  process.exitCode = 1;
} finally {
  for (const client of clients) await client.auth.signOut();
  for (const id of users) await value(admin.auth.admin.deleteUser(id));
  const result = await cleanupBatch({ url: url.href, key: config.SERVICE_ROLE_KEY });
  if (result.failed) { console.error('Fixture cleanup incomplete'); process.exitCode = 1; }
}
