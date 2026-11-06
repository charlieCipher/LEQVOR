# Account-to-record validation — 14 September 2026

## Latest result — 20 September 2026: real local backend passed

The isolated `local-backend-validation` Supabase stack is now running. Both LEQVOR migrations applied to its actual PostgreSQL database. The earlier Docker blockers below are historical.

- `supabase/tests/v5_isolation.sql`: passed with `ON_ERROR_STOP=1`; fixture transaction rolled back.
- `supabase/tests/record_transactions.sql`: passed with `ON_ERROR_STOP=1`; fixture transaction rolled back.
- `node scripts/validate-local-backend.mjs`: exited 0. Two disposable users authenticated through local GoTrue. Real client crypto created and persisted a vault, unlocked it with its recovery secret, encrypted a record and independent attachment, uploaded/downloaded ciphertext through Storage, and decrypted the original content locally.
- Account B could not read A's vault/record/file metadata, download A's object, edit/delete A's record or insert a record as A. Owner edit advanced the revision; a stale edit was rejected with `40001`.
- Owner deletion removed record and attachment metadata. The real cleanup worker processed the queue and removed the ciphertext object.
- Final database checks found zero disposable test accounts, zero objects in the local `vault-v5` bucket, and zero pending cleanup jobs.

Reproduction: start the isolated Supabase project, save `supabase status --workdir .local-backend-validation --output json` to the ignored `.local-backend-validation/status.json`, then run the Node runner above. The runner refuses any host/port other than `127.0.0.1:54321`; never commit its credential file.

Scope: actual local Auth, PostgreSQL/RLS, RPCs and object storage, with the application's crypto implementation. This does not prove production configuration, email delivery, live MFA, browser Reveal/timeout interactions, cross-device recovery, scheduled cleanup or independent security review. No production data or settings changed during this run.

## Local evidence

The following table records the earlier client/unit-test evidence; the live local backend results above supersede its database-execution limitations.

| Flow | Evidence | Boundary |
|---|---|---|
| Account sign-in/reset | Auth form calls provider, handles errors, clears successful password input; recovery response is generic | Auth provider is mocked; email delivery and live sign-in remain unverified |
| MFA | Vault stays hidden until returned assurance is valid; a successful challenge must establish AAL2 | SDK responses are mocked |
| Vault creation | Recovery confirmation is required; failed lookup cannot initiate creation; foreign-account vault response rejected | UI crypto is mocked, with separate real-crypto service test |
| Encryption and file storage | Real crypto creates VMK wrappers, record/file DEKs and ciphertext; serialized test storage excludes private canaries | In-memory database/object adapters, not live infrastructure |
| Reveal and file download | Explicit reveal yields original content; original filename and bytes round-trip | Service and UI tests; no live object-storage claim |
| Edit/conflict | Revision travels through provider; stale edit rejected by simulated transaction; UI hides stale content and offers reload | Postgres RPC behavior requires staging SQL execution |
| Cold Lock/recovery | Locked session rejects reveal; fresh controller with recovery secret opens saved record | Local contexts, not yet separate physical devices |
| Delete | Versioned RPC called; simulated deletion queues object cleanup; browser does not delete ciphertext first | SQL rollback scenarios provided but not executed |
| Sensitive action cancellation | Closed dialogs cannot execute after pending reauthentication resolves; duplicate pending submissions blocked | UI lifecycle tests |
| Upload failures | Oversized input rejected before reading; lost commit response preserves potentially committed attachment | Simulated network failures |

## Fixes made during validation

- Persist actual attachment count in encrypted metadata.
- Preserve attachment ciphertext after an uncertain database commit instead of deleting it.
- Move login/signup/reset and MFA checks through the authentication provider.
- Reject malformed MFA assurance and wrong-owner vault responses.
- Cancel deferred sensitive actions when their dialog unmounts.
- Reject oversized source files before reading, and oversized or malformed encrypted downloads before decryption.

## Required staging acceptance

1. Start Docker Desktop's Linux engine or provide the configured staging environment.
2. Review and apply migrations in order; do not point the new client at an unmigrated database.
3. Run `supabase/tests/v5_isolation.sql` and `supabase/tests/record_transactions.sql` against disposable staging fixtures.
4. Create two controlled accounts, verify email and TOTP, and complete vault setup separately.
5. In account A: create a record and attachment, reload the browser, unlock, reveal, download, edit from two sessions, and verify conflict handling.
6. In account B: attempt account A's record IDs, attachment paths and RPC calls; all must be denied.
7. Delete A's record, verify metadata and grant removal, run the cleanup worker, and verify inaccessible storage objects.
8. Use a clean browser/device to recover the vault and validate encrypted export/recovery.

No step above is marked passed merely because the sample preview works. Docker's Linux engine was still unavailable at the last check. No remote migration, account creation or production deployment was performed during this validation.

### Local environment startup attempt — 20 September

The official Supabase CLI (2.117.0) is available through npx. Initialized an isolated project at `.local-backend-validation` with copies of the two LEQVOR migrations, excluded from Git. Started Docker Desktop and attempted `supabase start` against that project.

Docker's host log reports a backend crash during Inference manager initialization: its `dockerInference` Unix socket cannot be accessed/removed, with an invalid filename/directory syntax error. The database engine did not become available. No SQL isolation or live storage scenario ran; no production data was touched. Resolve Docker Desktop startup or provide a disposable staging project before resuming real database acceptance.

On the requested retry, Docker again failed before the Linux engine became available. The new startup log (20 September, 12:07 UTC) identifies Secrets Engine initialization at `docker-secrets-engine/engine.sock` with the same socket access/path error class. Supabase startup was cancelled after confirming the crash. No database tests ran during this retry.

## Remote Supabase follow-up

After explicit user authorization, both V5 migrations were committed successfully to the existing Aureva production project. Read-only checks confirmed ten RLS-protected tables, the private ciphertext bucket, record RPCs, restricted direct-write privileges and preservation of the legacy schema. No account fixtures or destructive acceptance tests were run. See [Supabase rollout](SUPABASE-ROLLOUT.md) for the exact scope and remaining validation.

## 20 September authentication-provider hardening

- Sensitive-action reauthentication now rejects missing or malformed assurance, verifies the signed-in account identity, rechecks AAL2 after an MFA challenge and checks account identity again before returning success.
- Seven new mocked-provider cases cover password-only success, malformed assurance, a challenge that fails to establish AAL2, successful MFA and an account switch. Together with provider-contract and real-crypto account-to-record tests, 16 tests passed.
- These are client/provider checks, not server-side authorization enforcement or proof of live MFA delivery. Docker still reports no running engine; disposable database isolation execution remains blocked. No production settings or schema were changed in this pass.

## Cleanup worker resilience — 20 September

- Server-only cleanup now validates origin, batch bounds and opaque job paths before deletion; refuses redirects carrying service credentials; and applies a 15-second deadline per request, including queue response parsing.
- Failed storage removal is never acknowledged. Failed acknowledgements remain retryable. Partial failures now produce a nonzero CLI exit status for scheduler monitoring.
- Eight cleanup-worker tests passed, including malformed jobs, a stalled storage request and acknowledgement retry. Together with encrypted record lifecycle and reauthentication tests, 18 tests passed.
- Worker scheduling and real object-storage deletion remain unverified and undeployed. This pass did not delete any production objects or change production configuration.
