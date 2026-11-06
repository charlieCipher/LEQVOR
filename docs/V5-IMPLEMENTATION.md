# LEQVOR V5 implementation and release ledger

> Current deployment evidence (28 September 2026) is in `PRODUCTION-VALIDATION-2026-09-28.md`; current handoff is `DEPLOYMENT-HANDOFF.md`. Historical statements below about migrations and SQL tests being unexecuted are superseded: V5 foundation, transaction and ciphertext-envelope migrations are applied in production; disposable PostgreSQL tests and a synthetic database restore drill pass. Authenticated hosted acceptance, scheduled backups/cleanup and advanced live integrations remain incomplete.

The 13 September LEQVOR master specification is the architecture authority; see `LEQVOR-MASTER-ARCHITECTURE.md`. The approved LEQVOR by LENVOR UI remains intact. The superseded Aureva specification is preserved in `V5-product-specification.txt` for history.

## Implemented locally

- Seven distinct responsive experiences; `/auth`, `/app`, `/app/vault`, `/app/vault/new`, `/app/vault/:id`, `/app/people`, `/app/continuity`, `/app/security`.
- Explicit sample workspace (`?preview=1`) with session-only fictional information, separate from account authentication and storage. Example statuses are labeled.
- Versioned random 256-bit VMK; Argon2id password KEK; 256-bit client-generated BIP39 recovery secret and HKDF recovery KEK; distinct authenticated wrappers for the VMK.
- Independent random record/file DEKs; AES-256-GCM with identity- and purpose-bound AAD; encrypted titles, private content, filenames, and trusted-person descriptions.
- Mandatory recovery verification before new vault creation; separate account and vault unlock; recovery-based password replacement without re-encrypting records; nondestructive recovery practice.
- V5 create, list, explicit reveal, encrypted update, fresh-authenticated delete, encrypted file upload/download, encrypted recovery-package export after fresh authentication.
- Offline recovery verification from an exported package and recovery secret alone: hidden terminal input, authenticated decryption of all supplied records/files, structural consistency checks, no plaintext output. See `OFFLINE-RECOVERY.md`. Export performs structural validation before download. This is a drill utility, not the pending standalone restore/import tool.
- In-memory metadata search, 30-second reveal expiry, immediate focus-loss lock, configurable inactivity Cold Lock, Lock & Purge; async results invalidated by session generation.
- Session-generation checks before asynchronous write dispatch and explicit vault/owner validation at record service entry points. Requests already dispatched cannot be cancelled by this client guard; server authorization remains mandatory.
- Main application session subscription, session lookup and account password reset use the authentication provider boundary. A stale initial lookup cannot override a newer authentication event. Other legacy provider-specific UI calls still require migration.
- V5 database and object upload adapters enforce explicit ciphertext transport schemas, rejecting unknown plaintext/UI fields and unsupported encryption envelopes before request dispatch. This is defense in depth, not proof that arbitrary user-supplied strings are encrypted; authenticated decryption and server validation remain separate requirements.
- TOTP authentication challenge and enrollment through existing Supabase Auth. Passkeys/device-bound unlock are not implemented.
- Encrypted continuity templates and statements, original locations, contacts and next steps. Deterministic readiness v1 is `(one documented record + six completed continuity fields) / seven criteria per active record`; archived records and personal statements are excluded. It is not a security score.
- Additive owner-isolated schema and storage policies, guarded person verification, owner-only read access and no client writes for unconnected grant/history workflows.
- Cryptographic sharing primitives: ECDH P-256 + HKDF + AES-GCM wrapping, VMK-encrypted sharing private key, recipient-device migration; new record keys invalidate old grants for future ciphertext.
- Signed hash-chain primitives with independently supplied checkpoint required for successful chain validation.
- Allowlisted event payloads, frontend rejection of service-role/secret keys, production CSP/framing/permissions headers; no advertising or AI integrations.
- V4 record import creates an encrypted copy with the original secret. It does not destroy original data. Older plaintext metadata remains until a separately verified removal/migration process. V4 standalone letters have not yet received an import UI.
- Subscription-only pricing display and public trust/security/privacy/status/disclosure draft surfaces with explicit development and audit limitations.

## Audit findings addressed

The starting implementation derived keys independently from record secrets, retained plaintext titles in database rows, did not connect its recovery phrase to encrypted record keys, and produced illustrative audit/security events. V5 introduces a separate key hierarchy and storage format, removes invented audit events from the audit service, and separates samples from live capability states. New sensitive writes go through V5 services; legacy readers remain for migration compatibility.

## Verification boundaries

See `ACCOUNT-RECORD-VALIDATION.md` for the current connected-flow evidence and remaining staging acceptance steps. Real cryptography is exercised across create/list/reveal/download/edit/lock/recover/delete with in-memory transport; separate UI and provider-contract tests cover auth, MFA, setup and sensitive-action cancellation. These do not replace live database, email, MFA or storage validation.

The 13 September record transaction migration adds revision-checked update/delete RPCs and a transactional ciphertext cleanup outbox. The client uses these RPCs; a server-only retry worker and disposable SQL scenarios are included. Migration and worker scheduling are NOT deployed. See `RECORD-TRANSACTIONS.md`. This replaces browser-first object deletion but does not yet reconcile interrupted uploads.

Local automated tests cover V4 decrypt compatibility, V5 encrypted metadata and files, wrong secrets, recovery in a fresh context, password rewrapping, corrupted and swapped envelopes, KDF parameter validation, unique nonces, nonextractable VMKs, Cold Lock cache clearing, late-result rejection, event canary filtering, sharing-key migration and key rotation, and signed-history modification/truncation. UI workflow tests cover reveal/concealment and error recovery.

`supabase/tests/v5_isolation.sql` is an executable disposable-database test of actual RLS. It has NOT been run in this environment: no Supabase administration connector, `supabase`, or `psql` was available, and the installed Docker CLI could not connect to a running Docker engine. No remote migration or deployment was performed. Apply `20260911_continuity_v5.sql` after the existing migrations in a reviewed staging database, then execute the isolation tests and full auth/storage scenarios. Earlier migrations may already have permissive policies; the V5 owner restrictions are restrictive policies to guard against accidental broad authenticated policies.

## Not ready for production

The full ten-phase specification is **not complete**. These remain mandatory:

1. Staging migration, account signup/email/TOTP end-to-end validation, real browser refresh and clean-device recovery, device/browser performance validation, multi-account database and object-store isolation tests, and network/persistent-storage canary inspection.
2. Transactional interrupted-upload cleanup/reconciliation and grant/record updates. Record and file metadata commit atomically through an invoker-rights Postgres function. Cleanup before a commit attempt can compensate uploads; after a commit attempt, ciphertext is retained because a lost response does not prove rollback. Record deletion uses a transactional cleanup outbox and worker in the pending migration. Upload-crash reconciliation is not implemented.
3. Verified recipient identity and public-key registration, public-key substitution protection, invitation delivery, grants authorization, signed transactional revocation, and recipient UI. Crypto primitives alone do not authorize sharing; these operations are disabled in the database and UI.
4. Durable signed event/version storage, trusted device signing lifecycle, independent checkpoint storage and verification. The public UI makes no tamper-evident claim.
5. A deployable independent/offline recovery utility, versioned package importer, scheduled secondary ciphertext backups, documented retention and deletion, successful isolated restore exercises.
6. Passkeys, device KEKs, simplified Shield, Duress/Safe Vault and PIN scrambling. These are optional or later-phase interfaces, not active protections. No alternate-vault deception is claimed.
7. Complete continuity graph editing, archive and grant-aware freshness reviews, continuity drill, notification scheduling, server-enforced subscriptions/billing, and professional workflows.
8. Separate marketing/vault origins, verified production response headers, monitored status and responsible disclosure channels, finalized privacy/retention terms, external security review and penetration testing.

## Browser limits

Cold Lock drops application references, wipes writable byte arrays, clears metadata/search, and revokes tracked object URLs. JavaScript and browser garbage collection cannot guarantee forensic erasure of every historical memory copy. Screenshots, malicious extensions, malware, and recipient copying remain outside these controls. Password authentication is never treated as possession of the vault key.
