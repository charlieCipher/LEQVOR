// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import process from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVaultEnvelope, generateRecoverySecret, unlockVault, encryptRecord, encryptDocument, digest } from '../src/modules/security/v5Crypto.js';
import { verifyRecoveryPackage, validateRecoveryPackage } from '../src/modules/security/recoveryPackage.js';
let phrase, pkg;
beforeAll(async () => {
  phrase = generateRecoverySecret();
  const vault = await createVaultEnvelope('owner', 'long testing password', phrase);
  const key = await unlockVault(vault, phrase, true);
  const record = await encryptRecord(key, { owner_id:'owner', vault_id:vault.id, metadata:{title:'PRIVATE_CANARY'}, payload:{instructions:'PRIVATE_CANARY'} });
  const doc = await encryptDocument(key, { owner_id:'owner', vault_id:vault.id, record_id:record.id, name:'private.txt', type:'text/plain', bytes:new TextEncoder().encode('PRIVATE_CANARY') });
  const content = { format:'leqvor-recovery-package-v5', vault, records:[record], people:[], files:[doc.row], objects:[{path:doc.row.storage_path,envelope:doc.envelope}] };
  pkg = {content, manifest:await digest(content)};
}, 30000);
async function changed(edit) {
  const next = structuredClone(pkg);
  edit(next.content);
  next.manifest = await digest(next.content);
  return next;
}
describe('independent recovery verification', () => {
  it('recovers a disk export in a separate process with no original session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leqvor-recovery-test-'));
    let child;
    try {
      const path = join(directory, 'synthetic.leqvor');
      const serialized = JSON.stringify(pkg);
      expect(serialized).not.toContain('PRIVATE_CANARY');
      expect(serialized).not.toContain(phrase);
      await writeFile(path, serialized, { flag: 'wx', mode: 0o600 });
      const result = await new Promise((resolve, reject) => {
        child = fork(fileURLToPath(new URL('./fixtures/recovery-process.mjs', import.meta.url)), [], {
          execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: { ...process.env, NODE_OPTIONS: '' },
        });
        let reply, output = '';
        const timeout = setTimeout(() => { child.kill(); reject(new Error('Recovery process timed out')); }, 20000);
        child.stdout.on('data', data => { output += data; });
        child.stderr.on('data', data => { output += data; });
        child.on('message', value => { reply = value; });
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => {
          clearTimeout(timeout);
          if (code !== 0 || !reply) reject(new Error('Recovery process failed'));
          else resolve({ ...reply, output });
        });
        child.send({ path, phrase });
      });
      expect(result).toEqual({ ok: true, counts: { records: 1, people: 0, files: 1 }, output: '' });
    } finally {
      if (child && child.exitCode === null) child.kill();
      await rm(join(directory, 'synthetic.leqvor'), { force: true });
      await (await import('node:fs/promises')).rmdir(directory);
    }
  });
  it('recovers records and attachments from the package and secret alone', async () => {
    const result = await verifyRecoveryPackage(pkg, phrase);
    expect(result).toEqual({records:1,people:0,files:1});
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY');
  });
  it('rejects missing attachments even with a recomputed unkeyed manifest', async () => {
    await expect(validateRecoveryPackage(await changed(c=>c.objects=[]))).rejects.toThrow();
  });
  it('rejects cross-vault rows and duplicate identifiers', async () => {
    await expect(validateRecoveryPackage(await changed(c=>c.records[0].vault_id='other'))).rejects.toThrow();
    await expect(validateRecoveryPackage(await changed(c=>c.records.push(c.records[0])))).rejects.toThrow();
  });
  it('rejects ciphertext corruption despite a recomputed manifest', async () => {
    const next = await changed(c=>{const e=c.objects[0].envelope;e.ciphertext=(e.ciphertext[0]==='A'?'B':'A')+e.ciphertext.slice(1)});
    await expect(verifyRecoveryPackage(next,phrase)).rejects.toThrow('Recovery verification failed');
  });
  it('verifies encrypted historical snapshots and rejects substituted history ownership',async()=>{
    const next=await changed(c=>{const snapshot={...c.records[0],revision:1};c.versions=[{record_id:snapshot.id,owner_id:snapshot.owner_id,vault_id:snapshot.vault_id,revision:1,snapshot,files:c.files}];});
    await expect(verifyRecoveryPackage(next,phrase)).resolves.toEqual({records:1,people:0,files:1});
    next.content.versions[0].snapshot.owner_id='other';next.manifest=await digest(next.content);
    await expect(validateRecoveryPackage(next)).rejects.toThrow();
  });
  it('rejects the wrong recovery secret', async () => {
    await expect(verifyRecoveryPackage(pkg,generateRecoverySecret())).rejects.toThrow('Recovery verification failed');
  });
});
