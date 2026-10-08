import { insuranceIndex } from '../insurance/continuity';
import { DatabaseProvider, ObjectStorageProvider } from "../../lib/providers";
import {completeness} from '../continuity/readiness';
import { AurevaError } from '../security/safeEvents';
import { recipientKeyFingerprint } from '../security/recipientKeys';
import { verifyRecipientCard } from '../security/recipientCard';
import { ContinuityGraphService } from '../continuity/ContinuityGraphService';
import {
  encryptRecord,
  decryptRecordMetadata,
  decryptRecordPayload,
  encryptDocument,
  decryptDocument,
  newId,
  MAX_DOCUMENT_BYTES,
  createSharingIdentity,
  verifySharingIdentity,
} from "../security/v5Crypto";
export class V5VaultService {
  constructor(
    session,
    vault,
    db = DatabaseProvider,
    storage = ObjectStorageProvider,
  ) {
    this.session = session;
    this.vault = vault;
    this.db = db;
    this.storage = storage;
    this.graph = new ContinuityGraphService(session, vault, db);
  }
  async list() {
    return this.session.run(async (key, assertActive) => {
      const rows = await this.db.listRecords();
      assertActive();
      const all = await Promise.all(
        rows.map(async (row) => {
          assertActive();
          this.assertIdentity(row);
          const metadata = await decryptRecordMetadata(key, row);
          return { ...metadata, ...row, files:metadata.file_count||0,v5: true };
        }),
      );
      return all;
    });
  }
  async create(metadata, payload, file) {
    if (file && (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_BYTES))
      throw new AurevaError('FILE_TOO_LARGE', 'Choose a file no larger than 10 MB.');
    const id = newId(),
      identity = { id, owner_id: this.vault.owner_id, vault_id: this.vault.id };
    return this.session.run(async (key, assertActive) => {
      metadata = { ...metadata, file_count: file?.size ? 1 : 0 };
      if(metadata.category === "Insurance") metadata={...metadata, insurance_index:insuranceIndex(payload, file?.size ? 1 : 0)};
      const row = await encryptRecord(key, { ...identity, metadata, payload });
      assertActive();
      let doc = null,
        uploaded = false,
        saved = false,
        commitAttempted = false;
      try {
        if (file?.size) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          try {
            assertActive();
            doc = await encryptDocument(key, {
              record_id: id,
              owner_id: identity.owner_id,
              vault_id: identity.vault_id,
              name: file.name,
              type: file.type,
              bytes,
            });
          } finally {
            bytes.fill(0);
          }
          assertActive();
          await this.storage.upload(doc.row.storage_path, doc.envelope);
          uploaded = true;
        }
        assertActive();
        commitAttempted = true;
        const record = await this.db.saveRecordBundle(row,doc?.row);
        saved = true;
        return { ...metadata, ...record, v5: true, files: doc ? 1 : 0 };
      } catch (error) {
        // A lost response does not prove the transaction failed. Preserve its
        // ciphertext for reconciliation rather than breaking a committed record.
        if (uploaded && !saved && !commitAttempted) {
          try {
            await this.storage.remove([doc.row.storage_path]);
          } catch {
            throw new Error(
              "Record save failed. An encrypted orphan attachment requires cleanup.",
            );
          }
        }
        throw error;
      }
    });
  }
  reveal(record) {
    this.assertIdentity(record);
    return this.session.run((key) => decryptRecordPayload(key, record));
  }
  async update(record, metadata, payload) {
    this.assertIdentity(record);
    return this.session.run(async (key, assertActive) => {
      metadata={...await decryptRecordMetadata(key,record),...metadata,completeness:completeness(payload)};
      assertActive();
      if(metadata.category === "Insurance") metadata.insurance_index=insuranceIndex(payload,metadata.file_count||0);
      const encrypted = await encryptRecord(key, {
        id: record.id,
        owner_id: record.owner_id,
        vault_id: record.vault_id,
        metadata,
        payload,
      });
      assertActive();
      const row = await this.db.updateRecord(record.id, {
        ...encrypted,
        updated_at: new Date().toISOString(),
      }, this.requireRevision(record));
      return { ...metadata, ...row, v5: true };
    });
  }
  async files(record) {
    this.assertIdentity(record);
    return this.session.run(async (_key, assertActive) => {
      const rows = await this.db.files(record.id);
      assertActive();
      for (const row of rows) {
        this.assertFileIdentity(row);
        if (row.record_id !== record.id)
          throw new Error('File does not belong to this record.');
      }
      return rows;
    });
  }
  async download(row) {
    this.assertFileIdentity(row);
    return this.session.run(async (key, assertActive) => {
      const envelope = await this.storage.download(row.storage_path);
      assertActive();
      return decryptDocument(key, row, envelope);
    });
  }
  async remove(record) {
    this.assertIdentity(record);
    return this.session.run(async (_key, assertActive) => {
      assertActive();
      await this.db.deleteRecord(record.id, this.requireRevision(record));
    });
  }
  async addPerson(metadata, verification) {
    return this.session.run(async (key, assertActive) => {
      const {recipient_binding: _ignoredBinding, ...details} = metadata;
      const recipient_binding = verification ? await verifyRecipientCard(verification.card, verification.fingerprint, this.vault.owner_id) : null;
      assertActive();
      const row = await encryptRecord(key, {
        owner_id: this.vault.owner_id,
        vault_id: this.vault.id,
        metadata: {...details, ...(recipient_binding ? {recipient_binding} : {})},
        payload: {},
      });
      assertActive();
      const saved = await this.db.savePerson({ ...row, status: "unverified" });
      return { ...details, ...(recipient_binding ? {recipient_binding} : {}), ...saved, v5: true };
    });
  }
  async people() {
    return this.session.run(async (key, assertActive) => {
      const rows = await this.db.people();
      assertActive();
      return Promise.all(
        rows.map(async (row) => {
          assertActive();
          this.assertIdentity(row);
          return {
            ...(await decryptRecordMetadata(key, row)),
            ...row,
            v5: true,
          };
        }),
      );
    });
  }
  async sharingIdentity(register=false) {
    return this.session.run(async(key,assertActive)=>{
      let identity=await this.db.sharingIdentity();
      assertActive();
      if (!identity && register) {
        const generated=await createSharingIdentity(key,this.vault.owner_id);
        assertActive();
        identity=await this.db.registerSharingIdentity(this.vault.id,generated);
        assertActive();
      }
      if (!identity) return null;
      if (identity.owner_id!==this.vault.owner_id || identity.vault_id!==this.vault.id || identity.crypto_version!=='leqvor-v5')
        throw new Error('Sharing identity does not belong to this vault.');
      await verifySharingIdentity(key,identity);
      const fingerprint=await recipientKeyFingerprint(identity.public_key);
      assertActive();
      // Return public presentation data only, never the encrypted private wrapper.
      const {kty,crv,x,y}=identity.public_key;
      return {owner_id:identity.owner_id,fingerprint,card:JSON.stringify({version:'leqvor-recipient-v1',owner_id:identity.owner_id,public_key:{kty,crv,x,y}})};
    });
  }
  assertFileIdentity(row) {
    this.assertIdentity(row);
    const segments = [row.owner_id, row.record_id, row.id];
    if (segments.some(part => typeof part !== 'string' || !/^[a-zA-Z0-9-]+$/.test(part)) ||
        row.storage_path !== segments.join('/'))
      throw new Error('File storage identity is invalid.');
  }
  requireRevision(record) {
    if (!Number.isSafeInteger(record.revision) || record.revision < 1)
      throw new Error('Record version unavailable. Reload after the database migration.');
    return record.revision;
  }
  assertIdentity(row) {
    if (!row?.id || row.owner_id !== this.vault.owner_id || row.vault_id !== this.vault.id)
      throw new Error("Record does not belong to this vault.");
  }
}
