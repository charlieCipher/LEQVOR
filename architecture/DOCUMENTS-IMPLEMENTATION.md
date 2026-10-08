# Documents — 8 October 2026

Production migration applied on 8 October 2026. Rollback-only production verification passed on 9 October 2026. Matching frontend commit `c68001b` is Ready in Vercel Production and assigned to `leqvor.vercel.app` (verified 9 October 2026).

- Document create/edit/reveal links existing custodians, professionals, people and typed assets. Missing links must be explicitly removed. Original location, execution state, physical-original existence and jurisdiction remain encrypted record fields.
- Each graph relationship is encrypted independently. Document saves atomically commit the record, new attachment metadata and managed graph edges. Relationship labels do not grant access or assert legal validity.
- Migration `20261008_document_workflow.sql` introduces owner-readable `record_revision_history`. Authenticated clients cannot insert, update or delete snapshots. A database-owned deferred trigger captures record ciphertext and attachment descriptors from the save transaction. It applies to all records so a client cannot evade capture by changing an encrypted type.
- Existing records receive only a baseline of their current revision. No past history is invented. Deleting a record cascades its snapshots; this is application-level immutable history while the record exists, not protection against database administrators or digitally signed history.
- Document history loads ciphertext first and decrypts only on explicit reveal. Historical views are read-only, inherit the protected record's reveal lifetime, and reference immutable encrypted attachment objects.
- Encrypted recovery exports include revisions. Verification checks snapshot ownership, revision identity, attachment consistency and decryption. Restore drill preserves captured history.

Validation: 204 regression tests passed before the export addition; seven focused recovery tests passed afterward, including encrypted history and cross-owner substitution rejection. PostgreSQL document tests passed atomic rollback, stale edits, owner isolation, attachment capture and denied history mutation/deletion. Build, lint and encrypted restore passed. Build retains a bundle-size warning.

Production SQL verified document saves, attachment snapshots, atomic rollback, revisions, cross-account isolation and denied history mutation/deletion. Real hosted API tests with two disposable accounts also passed encrypted document saves, custodians, evidence uploads, two persisted revisions, historical payload and attachment decryption, denied history mutation/deletion and cross-account history isolation. The core hosted account/record/file acceptance suite passed again after the migration. Temporary API test accounts and fixtures were removed and account absence verified.

Hosted browser acceptance, physical-device acceptance and independent review remain unverified. The existing browser asset test account remains locked due to focus loss; its credentials are local ignored test fixtures, not part of this release. See `HOSTED-DOCUMENTS-ACCEPTANCE-2026-10-09.md` for scope and reproduction.
