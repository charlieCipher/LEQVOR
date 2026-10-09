import { insuranceIndex } from '../insurance/continuity';
import { DatabaseProvider, ObjectStorageProvider } from "../../lib/providers";
import {completeness,continuityIndex} from '../continuity/readiness';
import { AurevaError } from '../security/safeEvents';
import { recipientKeyFingerprint } from '../security/recipientKeys';
import { verifyRecipientCard,verifyReviewCard } from '../security/recipientCard';
import { ContinuityGraphService } from '../continuity/ContinuityGraphService';
import {documentGraph} from '../continuity/documentGraph';
import {SharingService} from '../continuity/SharingService';
import {TriggerPlanningService} from '../continuity/TriggerPlanningService';
import {SecurityHistoryService} from '../security/SecurityHistoryService';
import {assetGraph} from '../continuity/assetGraph';
import {insuranceGraph} from '../continuity/insuranceGraph';
import {
  encryptRecord,
  decryptRecordMetadata,
  decryptRecordPayload,
  encryptDocument,
  decryptDocument,
  decryptDocumentMetadata,
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
    this.securityHistory = new SecurityHistoryService(session,vault,db);
    this.graph = new ContinuityGraphService(session, vault, db);
    this.sharing = new SharingService(session, vault, db);
    this.triggerPlanning = new TriggerPlanningService(session, vault, db);
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
    if(metadata.category==='Insurance')payload={...payload,continuity_details:{...payload.continuity_details,kind:'POLICY'}};
    if (file && (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_BYTES))
      throw new AurevaError('FILE_TOO_LARGE', 'Choose a file no larger than 10 MB.');
    const id = newId(),
      identity = { id, owner_id: this.vault.owner_id, vault_id: this.vault.id };
    return this.session.run(async (key, assertActive) => {
      metadata = { ...metadata, completeness:completeness(payload), continuity_index:continuityIndex(payload), continuity_kind:metadata.category==='Insurance'?'POLICY':payload.continuity_details?.kind||'OTHER', file_count: file?.size ? 1 : 0 };
      if(metadata.category === "Insurance") metadata={...metadata, insurance_index:insuranceIndex(payload, file?.size ? 1 : 0)};
      const row = await encryptRecord(key, { ...identity, metadata, payload });
      const graph=metadata.continuity_kind==='ASSET'?await assetGraph(key,row,payload.continuity_details.asset):metadata.continuity_kind==='DOCUMENT'?await documentGraph(key,row,payload.continuity_details.document):metadata.continuity_kind==='POLICY'&&metadata.category==='Insurance'?await insuranceGraph(key,row,payload.insurance):null;
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
        const saveGraph=metadata.continuity_kind==='DOCUMENT'?this.db.saveDocumentBundle:metadata.continuity_kind==='POLICY'?this.db.savePolicyBundle:this.db.saveAssetBundle;
        const record = graph ? await saveGraph(row,null,doc?.row,graph) : await this.db.saveRecordBundle(row,doc?.row);
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
  async update(record, metadata, payload, file) {
    this.assertIdentity(record);
    if(file && (!Number.isFinite(file.size)||file.size<0||file.size>MAX_DOCUMENT_BYTES))throw new AurevaError('FILE_TOO_LARGE','Choose a file no larger than 10 MB.');
    return this.session.run(async (key, assertActive) => {
      const originalMetadata=await decryptRecordMetadata(key,record);
      metadata={...originalMetadata,...metadata,completeness:completeness(payload),continuity_index:continuityIndex(payload)};
      if(metadata.category==='Insurance'){
        payload={...payload,continuity_details:{...payload.continuity_details,kind:'POLICY'}};
        metadata.continuity_index=continuityIndex(payload);
      }
      if(['ASSET','DOCUMENT','POLICY'].includes(originalMetadata.continuity_kind)&&(payload.continuity_details?.kind!==originalMetadata.continuity_kind||(originalMetadata.continuity_kind==='POLICY'&&metadata.category!=='Insurance')))throw new AurevaError('RECORD_TYPE_CHANGE','Keep the record type when editing its relationships.');
      metadata.continuity_kind=metadata.category==='Insurance'?'POLICY':payload.continuity_details?.kind||'OTHER';
      if(file?.size&&!['ASSET','DOCUMENT','POLICY'].includes(metadata.continuity_kind))throw new Error('Attachment updates require an asset, document or policy.');
      if(file?.size)metadata.file_count=(await this.db.files(record.id)).length+1;
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
      if(['ASSET','DOCUMENT'].includes(metadata.continuity_kind)||(metadata.continuity_kind==='POLICY'&&metadata.category==='Insurance')){
        const isDocument=metadata.continuity_kind==='DOCUMENT';
        const isPolicy=metadata.continuity_kind==='POLICY';
        const graph=isDocument?await documentGraph(key,record,payload.continuity_details.document):isPolicy?await insuranceGraph(key,record,payload.insurance):await assetGraph(key,record,payload.continuity_details.asset);
        let doc=null;
        if(file?.size){
          const bytes=new Uint8Array(await file.arrayBuffer());
          try{assertActive();doc=await encryptDocument(key,{record_id:record.id,owner_id:record.owner_id,vault_id:record.vault_id,name:file.name,type:file.type,bytes});}finally{bytes.fill(0);}
          assertActive();await this.storage.upload(doc.row.storage_path,doc.envelope);
        }
        // Preserve uploaded ciphertext if the transaction outcome is uncertain.
        assertActive();
        const row=await (isDocument?this.db.saveDocumentBundle:isPolicy?this.db.savePolicyBundle:this.db.saveAssetBundle)(encrypted,this.requireRevision(record),doc?.row,graph);
        assertActive();return {...metadata,...row,v5:true};
      }
      const row = await this.db.updateRecord(record.id, {
        ...encrypted,
        updated_at: new Date().toISOString(),
      }, this.requireRevision(record));
      return { ...metadata, ...row, v5: true };
    });
  }
  async versions(record) {
    this.assertIdentity(record);
    return this.session.run(async (_key,assertActive)=>{
      const rows=await this.db.recordVersions(record.id);assertActive();
      for(const row of rows){if(row.record_id!==record.id||row.owner_id!==this.vault.owner_id||row.vault_id!==this.vault.id||row.snapshot?.id!==record.id||row.snapshot?.revision!==row.revision)throw new Error('Invalid historical identity');this.assertIdentity(row.snapshot);for(const file of row.files||[]){this.assertFileIdentity(file);if(file.record_id!==record.id)throw new Error('Invalid historical file');}}
      return rows;
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
      const {recipient_binding: _ignoredBinding, review_signing_binding:_ignoredSigningBinding, ...details} = metadata;
      const recipient_binding = verification ? await verifyRecipientCard(verification.card, verification.fingerprint, this.vault.owner_id) : null;
      const review_signing_binding=verification?.reviewCard?await verifyReviewCard(verification.reviewCard,verification.reviewFingerprint,recipient_binding.account_id):null;
      assertActive();
      const row = await encryptRecord(key, {
        owner_id: this.vault.owner_id,
        vault_id: this.vault.id,
        metadata: {...details, ...(recipient_binding ? {recipient_binding} : {}),...(review_signing_binding?{review_signing_binding}:{})},
        payload: {},
      });
      assertActive();
      const saved = await this.db.savePerson({ ...row, status: "unverified" });
      assertActive();
      return { ...details, ...(recipient_binding ? {recipient_binding} : {}),...(review_signing_binding?{review_signing_binding}:{}), ...saved, v5: true };
    });
  }
  async updatePerson(person,details,reviewVerification) {
    this.assertIdentity(person);
    if(person.status!=='unverified'||!person.encrypted_metadata?.nonce)throw new Error('This contact cannot be edited through the unverified-contact workflow.');
    return this.session.run(async(key,assertActive)=>{
      const metadata=await decryptRecordMetadata(key,person);
      const payload=await decryptRecordPayload(key,person);
      // Preserve the encrypted recipient binding; profile edits cannot replace identity keys.
      const allowed=['display_name','relationship','professional','roles','professional_details','reviewed_at'];
      if(Object.keys(details).some(field=>!allowed.includes(field)))throw new Error('Unsupported contact edit.');
      const merged={...metadata,...details};
      if(reviewVerification){
        if(!metadata.recipient_binding?.verified_at||metadata.review_signing_binding)throw new Error('A confirmed recipient is required; existing signing keys cannot be replaced.');
        merged.review_signing_binding=await verifyReviewCard(reviewVerification.card,reviewVerification.fingerprint,metadata.recipient_binding.account_id);
      }
      const row=await encryptRecord(key,{id:person.id,owner_id:person.owner_id,vault_id:person.vault_id,metadata:merged,payload});
      assertActive();
      let saved;
      try{saved=await this.db.updatePerson({...row,status:'unverified'},person.encrypted_metadata.nonce);}
      catch(error){if(error?.code==='PGRST116')throw new AurevaError('STALE_CONTACT','This contact changed in another session. Close this form and reload People before editing again.');throw error;}
      assertActive();this.assertIdentity(saved);
      return {...merged,...saved,v5:true};
    });
  }
  async fileChoices(record){
    const rows=await this.files(record);
    return this.session.run(async(key,active)=>{
      const choices=[];
      for(const row of rows){const metadata=await decryptDocumentMetadata(key,row);active();choices.push({...row,name:typeof metadata.name==='string'?metadata.name:'Attachment'});}
      return choices;
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
