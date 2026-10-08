// Synthetic recovery-package restore drill. No production target or credentials.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createDisposableDatabase } from './check-database.mjs';
import { createVaultEnvelope, generateRecoverySecret, unlockVault, encryptRecord, encryptDocument, digest } from '../src/modules/security/v5Crypto.js';
import { verifyRecoveryPackage } from '../src/modules/security/recoveryPackage.js';

const tables = ['vaults','records','trusted_people','record_files'];
// Table names are a fixed allowlist; all row values are parameters.
async function restoreRows(db, content, owner) {
  await db.exec('begin');
  try {
    await db.query('insert into auth.users(id) values ($1)', [owner]);
    for (const [index, rows] of [[content.vault],content.records,content.people,content.files].entries()) {
      const table = tables[index];
      await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`, [JSON.stringify(rows)]);
    }
    if(content.versions){
      await db.exec('set constraints all immediate');
      await db.query('delete from public.record_revision_history where owner_id=$1',[owner]);
      await db.query('insert into public.record_revision_history select * from jsonb_populate_recordset(null::public.record_revision_history,$1::jsonb)',[JSON.stringify(content.versions)]);
    }
    await db.exec('commit');
  } catch (error) { await db.exec('rollback'); throw error; }
}
let source, restored, directory, phrase = '';
try {
  source = await createDisposableDatabase();
  const owner = crypto.randomUUID(), canary = 'LEQVOR_SYNTHETIC_RESTORE_CANARY';
  phrase = generateRecoverySecret();
  const vault = {...await createVaultEnvelope(owner,'synthetic restore password only',phrase), recovery_verified_at:new Date().toISOString()};
  let key = await unlockVault(vault,phrase,true);
  const record = await encryptRecord(key,{owner_id:owner,vault_id:vault.id,metadata:{title:canary},payload:{instructions:canary}});
  const person = await encryptRecord(key,{owner_id:owner,vault_id:vault.id,metadata:{title:canary},payload:{relationship:canary}});
  const file = await encryptDocument(key,{owner_id:owner,vault_id:vault.id,record_id:record.id,name:'synthetic.txt',type:'text/plain',bytes:new TextEncoder().encode(canary)});
  await source.query('insert into auth.users(id) values ($1)',[owner]);
  // Creation defaults are materialized by PostgreSQL before exporting the backup.
  for (const [table,row] of [['vaults',vault],['records',record],['trusted_people',person],['record_files',file.row]]) {
    const columns = Object.keys(row);
    assert.ok(columns.every(column=>/^[a-z_]+$/.test(column)));
    await source.query(`insert into public.${table} (${columns.join(',')}) values (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
  }
  const versions=(await source.query('select * from public.record_revision_history')).rows;
  const content = {versions,format:'leqvor-recovery-package-v5',vault:(await source.query('select * from public.vaults')).rows[0],records:(await source.query('select * from public.records')).rows,people:(await source.query('select * from public.trusted_people')).rows,files:(await source.query('select * from public.record_files')).rows,objects:[{path:file.row.storage_path,envelope:file.envelope}]};
  // PostgreSQL drivers may return Date objects; the package format contains JSON strings.
  const jsonContent = JSON.parse(JSON.stringify(content));
  const serialized = JSON.stringify({content:jsonContent,manifest:await digest(jsonContent)});
  assert.ok(!serialized.includes(canary) && !serialized.includes(phrase));
  directory = await mkdtemp(join(tmpdir(),'leqvor-restore-'));
  const backupPath = join(directory,'synthetic.leqvor');
  await writeFile(backupPath,serialized,{flag:'wx',mode:0o600});
  key = null;
  await source.close(); source = null;
  console.log('PASS encrypted disk snapshot; source database closed');

  const backup = JSON.parse(await readFile(backupPath,'utf8'));
  assert.deepEqual(await verifyRecoveryPackage(backup,phrase),{records:1,people:1,files:1});
  restored = await createDisposableDatabase();
  const broken = structuredClone(backup.content);
  broken.files[0].record_id = crypto.randomUUID();
  await assert.rejects(restoreRows(restored,broken,owner));
  for (const table of tables) assert.equal((await restored.query(`select id from public.${table}`)).rows.length,0);
  assert.equal((await restored.query('select id from auth.users')).rows.length,0);
  console.log('PASS invalid attachment restore rolls back all rows and fixture identity');
  await restoreRows(restored,backup.content,owner);
  assert.deepEqual(JSON.parse(JSON.stringify((await restored.query('select * from public.record_revision_history')).rows)),backup.content.versions);
  const recovered = {...backup.content,vault:(await restored.query('select * from public.vaults')).rows[0],records:(await restored.query('select * from public.records')).rows,people:(await restored.query('select * from public.trusted_people')).rows,files:(await restored.query('select * from public.record_files')).rows};
  const jsonRecovered = JSON.parse(JSON.stringify(recovered));
  assert.equal(await digest(jsonRecovered),backup.manifest);
  assert.deepEqual(await verifyRecoveryPackage({content:jsonRecovered,manifest:backup.manifest},phrase),{records:1,people:1,files:1});
  console.log('PASS fresh PostgreSQL restore preserves ciphertext, keys, metadata and file references');
  console.log('PASS restored records, person and attachment decrypt with recovery secret');
  const otherOwner = crypto.randomUUID();
  await restored.query('insert into auth.users(id) values ($1)',[otherOwner]);
  await restored.exec('begin; set local role authenticated;');
  await restored.query("select set_config('request.jwt.claim.sub',$1,true)",[otherOwner]);
  for (const table of tables) assert.equal((await restored.query(`select id from public.${table}`)).rows.length,0);
  await restored.exec('rollback');
  console.log('PASS restored vault remains hidden from another identity');
} catch {
  console.error('Restore drill failed; details suppressed to avoid exposing payloads.');
  process.exitCode = 1;
} finally {
  phrase = '';
  await source?.close(); await restored?.close();
  if (directory) { await rm(join(directory,'synthetic.leqvor'),{force:true}); await rmdir(directory); }
}
