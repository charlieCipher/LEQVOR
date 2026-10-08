import { digest, unlockVault, decryptRecordMetadata, decryptRecordPayload, decryptDocument } from './v5Crypto.js';

const FORMAT = 'leqvor-recovery-package-v5';
const fail = () => { throw new Error('Recovery package is incomplete or invalid.'); };

// The unkeyed manifest detects accidental damage, not malicious replacement or rollback.
export async function validateRecoveryPackage(pkg) {
  const c = pkg?.content;
  if (c?.format !== FORMAT || !c.vault?.id || !c.vault.owner_id ||
      typeof pkg.manifest !== 'string') fail();
  for (const name of ['records', 'people', 'files', 'objects'])
    if (!Array.isArray(c[name]) || c[name].length > 10000) fail();
  if (await digest(c) !== pkg.manifest) fail();
  const ids = new Set(), records = new Set(), paths = new Set();
  for (const row of [...c.records, ...c.people, ...c.files]) {
    if (typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
        row.owner_id !== c.vault.owner_id || row.vault_id !== c.vault.id) fail();
    ids.add(row.id);
  }
  c.records.forEach(row => records.add(row.id));
  for (const row of c.files) {
    if (!records.has(row.record_id) || typeof row.storage_path !== 'string' ||
        paths.has(row.storage_path)) fail();
    paths.add(row.storage_path);
  }
  if (c.objects.length !== paths.size) fail();
  for (const object of c.objects) {
    if (!paths.delete(object.path) || !object.envelope) fail();
  }
  if(c.versions!==undefined){
    if(!Array.isArray(c.versions)||c.versions.length>10000)fail();
    const seen=new Set();
    for(const version of c.versions){
      const identity=`${version.record_id}:${version.revision}`;
      if(seen.has(identity)||!records.has(version.record_id)||version.owner_id!==c.vault.owner_id||version.vault_id!==c.vault.id||!Number.isSafeInteger(version.revision)||version.revision<1||version.snapshot?.id!==version.record_id||version.snapshot?.revision!==version.revision||version.snapshot?.owner_id!==c.vault.owner_id||version.snapshot?.vault_id!==c.vault.id||!Array.isArray(version.files))fail();
      seen.add(identity);
      for(const file of version.files){const current=c.files.find(item=>item.id===file.id&&item.record_id===version.record_id);if(!current||await digest(current)!==await digest(file))fail();}
    }
  }
  return c;
}

export async function verifyRecoveryPackage(pkg, phrase) {
  const c = await validateRecoveryPackage(pkg);
  let key;
  try {
    key = await unlockVault(c.vault, phrase, true);
    for (const row of [...c.records, ...c.people]) {
      await decryptRecordMetadata(key, row);
      await decryptRecordPayload(key, row);
    }
    for(const version of c.versions||[]){
      await decryptRecordMetadata(key,version.snapshot);
      await decryptRecordPayload(key,version.snapshot);
    }
    const objects = new Map(c.objects.map(object => [object.path, object.envelope]));
    for (const file of c.files) {
      const document = await decryptDocument(key, file, objects.get(file.storage_path));
      document.bytes.fill(0);
    }
    return { records: c.records.length, people: c.people.length, files: c.files.length };
  } catch {
    throw new Error('Recovery verification failed. Check the secret and package integrity.');
  } finally {
    key = null;
  }
}
