// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  createVaultEnvelope,
  generateRecoverySecret,
  unlockVault,
  rewrapVaultPassword,
  encryptRecord,
  decryptRecordMetadata,
  decryptRecordPayload,
  encryptDocument,
  decryptDocument,
} from "../src/modules/security/v5Crypto.js";
import { VaultSession } from "../src/modules/security/VaultSession.js";
import { sanitizeEvent } from "../src/modules/security/safeEvents.js";
import { recipientKeyFingerprint } from '../src/modules/security/recipientKeys.js';
import {
  createSharingIdentity,
  createRecordGrant,
  decryptGrantedRecord,
} from "../src/modules/security/v5Crypto.js";
import {
  createDeviceSigningKey,
  signVersion,
  verifyVersionChain,
} from "../src/modules/security/verifiedHistory.js";
const CANARY = "AUREVA_SECRET_CANARY_83D2AE",
  password = "a sufficiently long vault password";
let vault, phrase, key, record;
beforeAll(async () => {
  phrase = generateRecoverySecret();
  vault = await createVaultEnvelope("owner-id", password, phrase);
  key = await unlockVault(vault, password);
  record = await encryptRecord(key, {
    id: "record-id",
    owner_id: "owner-id",
    vault_id: vault.id,
    metadata: { title: CANARY },
    payload: { instructions: CANARY },
  });
}, 30000);
describe("V5 cryptographic foundation", () => {
  it("stores only ciphertext for private metadata and payload", async () => {
    expect(JSON.stringify({ vault, record })).not.toContain(CANARY);
    expect(JSON.stringify(vault)).not.toContain(password);
    expect(JSON.stringify(vault)).not.toContain(phrase);
    expect(await decryptRecordMetadata(key, record)).toEqual({ title: CANARY });
    expect(await decryptRecordPayload(key, record)).toEqual({
      instructions: CANARY,
    });
    expect(key.extractable).toBe(false);
  });
  it("recovers from a clean context using only the recovery secret", async () => {
    const recovered = await unlockVault(
      JSON.parse(JSON.stringify(vault)),
      phrase,
      true,
    );
    expect(await decryptRecordMetadata(recovered, record)).toEqual({
      title: CANARY,
    });
  });
  it("rejects wrong recovery secrets", async () => {
    await expect(
      unlockVault(vault, generateRecoverySecret(), true),
    ).rejects.toThrow();
  });
  it("rejects wrong passwords", async () => {
    await expect(
      unlockVault(vault, "this is the wrong password"),
    ).rejects.toThrow();
  });
  it("rewraps the VMK without changing record ciphertext", async () => {
    const update = await rewrapVaultPassword(
      vault,
      password,
      "a new sufficient vault password",
    );
    const changed = { ...vault, ...update };
    const newKey = await unlockVault(
      changed,
      "a new sufficient vault password",
    );
    expect(await decryptRecordPayload(newKey, record)).toEqual({
      instructions: CANARY,
    });
    await expect(unlockVault(changed, password)).rejects.toThrow();
    expect(
      await decryptRecordPayload(
        await unlockVault(changed, phrase, true),
        record,
      ),
    ).toEqual({ instructions: CANARY });
  }); // Use the suite's 60s budget for multiple full-strength Argon2 operations.
  it("binds envelopes to record identity and purpose", async () => {
    await expect(
      decryptRecordPayload(key, { ...record, id: "other-record" }),
    ).rejects.toThrow();
    await expect(
      decryptRecordPayload(key, {
        ...record,
        encrypted_payload: record.encrypted_metadata,
      }),
    ).rejects.toThrow();
  });
  it("fails safely on corruption and unsupported versions", async () => {
    const envelope = {
      ...record.encrypted_payload,
      ciphertext: "AAAA" + record.encrypted_payload.ciphertext.slice(4),
    };
    await expect(
      decryptRecordPayload(key, { ...record, encrypted_payload: envelope }),
    ).rejects.toThrow();
    await expect(
      unlockVault(
        { ...vault, kdf_parameters: { ...vault.kdf_parameters, m: 1e12 } },
        password,
      ),
    ).rejects.toThrow("Unsupported");
  });
  it("uses independent keys and unique nonces for every record", async () => {
    const other = await encryptRecord(key, {
      id: record.id,
      owner_id: "owner-id",
      vault_id: vault.id,
      metadata: { title: CANARY },
      payload: { instructions: CANARY },
    });
    expect(other.wrapped_dek.ciphertext).not.toBe(
      record.wrapped_dek.ciphertext,
    );
    expect(other.encrypted_payload.nonce).not.toBe(
      record.encrypted_payload.nonce,
    );
  });
  it("encrypts bytes and filenames with an independent file key", async () => {
    const bytes = new TextEncoder().encode(CANARY);
    const doc = await encryptDocument(key, {
      record_id: record.id,
      owner_id: "owner-id",
      vault_id: vault.id,
      name: CANARY + ".txt",
      type: "text/plain",
      bytes,
    });
    expect(JSON.stringify(doc)).not.toContain(CANARY);
    const file = await decryptDocument(key, doc.row, doc.envelope);
    expect(new TextDecoder().decode(file.bytes)).toBe(CANARY);
    expect(file.name).toBe(CANARY + ".txt");
    await expect(
      decryptDocument(key, { ...doc.row, id: "wrong" }, doc.envelope),
    ).rejects.toThrow();
  });
});
describe("Cold Lock and leak boundaries", () => {
  it("clears the key and search state and rejects late async results", async () => {
    const session = new VaultSession();
    session.unlock(key);
    session.cache(record.id, { title: CANARY });
    expect(session.search(CANARY)).toEqual([record.id]);
    let resolve;
    const pending = session.run(() => new Promise((r) => (resolve = r)));
    session.lock();
    resolve(CANARY);
    await expect(pending).rejects.toThrow("locked");
    expect(session.search(CANARY)).toEqual([]);
    expect(session.unlocked).toBe(false);
    await expect(session.run(() => CANARY)).rejects.toThrow("Unlock");
    session.dispose();
  });
  it("locks on configured inactivity and resets on activity", () => {
    vi.useFakeTimers();
    const s = new VaultSession(60000);
    s.unlock(key);
    vi.advanceTimersByTime(59000);
    s.touch();
    vi.advanceTimersByTime(59000);
    expect(s.unlocked).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(s.unlocked).toBe(false);
    s.dispose();
    vi.useRealTimers();
  });
  it("allowlists telemetry and drops private payloads", () => {
    const event = sanitizeEvent({
      event_code: "RECORD_CREATED",
      severity: "INFO",
      record_id: "123-abc",
      password: CANARY,
      recovery: CANARY,
      token: CANARY,
      title: CANARY,
      payload: { notes: CANARY },
    });
    expect(JSON.stringify(event)).not.toContain(CANARY);
    expect(event).toEqual({
      event_code: "RECORD_CREATED",
      severity: "INFO",
      record_id: "123-abc",
    });
  });
});
describe("sharing and history primitives (not server authorization)", () => {
  it("preserves recipient access across devices and rotates keys for future revocation", async () => {
    const recipientVault = await createVaultEnvelope(
      "recipient",
      password,
      generateRecoverySecret(),
    );
    const recipientKey = await unlockVault(recipientVault, password);
    const identity = await createSharingIdentity(recipientKey, "recipient");
    const grant = await createRecordGrant(
      key,
      record,
      "recipient",
      identity.public_key,
      await recipientKeyFingerprint(identity.public_key),
    );
    expect(JSON.stringify(grant)).not.toContain(CANARY);
    for (const mutation of [{owner_id:'other-owner'}, {vault_id:'other-vault'}, {permissions:'edit'}, {grant_version:2}]) {
      await expect(decryptGrantedRecord(recipientKey, identity, {...grant,...mutation}, record)).rejects.toThrow('Grant identity mismatch');
    }
    const recoveredDevice = await unlockVault(
      JSON.parse(JSON.stringify(recipientVault)),
      password,
    );
    expect(
      (await decryptGrantedRecord(recoveredDevice, identity, grant, record))
        .metadata.title,
    ).toBe(CANARY);
    const rotated = await encryptRecord(key, {
      id: record.id,
      owner_id: record.owner_id,
      vault_id: record.vault_id,
      metadata: { title: CANARY },
      payload: { instructions: "New version" },
    });
    await expect(
      decryptGrantedRecord(recipientKey, identity, grant, rotated),
    ).rejects.toThrow();
  }, 30000);
  it("detects signed history modification, truncation, and missing checkpoints", async () => {
    const pair = await createDeviceSigningKey();
    const first = await signVersion(pair.privateKey, {
      record_id: record.id,
      version: 1,
      previous_hash: null,
      ciphertext: record,
      created_at: "2026-09-11T00:00:00Z",
      crypto_version: "leqvor-v5",
    });
    const second = await signVersion(pair.privateKey, {
      record_id: record.id,
      version: 2,
      previous_hash: first.version_hash,
      ciphertext: record,
      created_at: "2026-09-11T00:01:00Z",
      crypto_version: "leqvor-v5",
    });
    expect(
      await verifyVersionChain(
        pair.publicKey,
        [first, second],
        second.version_hash,
        record.id,
      ),
    ).toBe(true);
    expect(
      await verifyVersionChain(pair.publicKey, [first], second.version_hash, record.id),
    ).toBe(false);
    expect(
      await verifyVersionChain(
        pair.publicKey,
        [{ ...first, created_at: "changed" }, second],
        second.version_hash,
        record.id,
      ),
    ).toBe(false);
    expect(await verifyVersionChain(pair.publicKey, [first, second])).toBe(
      false,
    );
    expect(await verifyVersionChain(pair.publicKey, [first, second], second.version_hash, 'other-record')).toBe(false);
    const spliced = await signVersion(pair.privateKey, {
      record_id:'other-record', version:2, previous_hash:first.version_hash,
      ciphertext:record, created_at:'2026-09-11T00:01:00Z', crypto_version:'leqvor-v5',
    });
    expect(await verifyVersionChain(pair.publicKey, [first, spliced], spliced.version_hash, record.id)).toBe(false);
    for (const malformed of [null, {}, [null], [{...first,signature:'!'.repeat(88)}]]) {
      expect(await verifyVersionChain(pair.publicKey, malformed, first.version_hash, record.id)).toBe(false);
    }
  });
});
