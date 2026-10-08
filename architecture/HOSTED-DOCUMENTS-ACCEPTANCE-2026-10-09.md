# Hosted Documents acceptance — 9 October 2026

## Verified release

Supabase project: `awdsyhxdnyfilnzamflt`.
Migration: `20261008_document_workflow.sql`.
Frontend: commit `c68001b`, Vercel deployment `EaHwwSDgYeZZuU8rwxR9kjUhncEs`.
Vercel displayed Ready, Production, Current and domain `leqvor.vercel.app`.

## Results

- Production rollback-only SQL suite passed atomic saves, attachment capture, stale revision rejection, transaction rollback, owner isolation and denied history update/delete.
- The existing hosted two-account account/record/file suite passed after the migration.
- New hosted Documents API acceptance passed creation of an encrypted document linked to a custodian, encrypted evidence upload, edit with a second attachment and two persisted revision snapshots.
- Both historical payloads decrypted to their expected synthetic locations. The first revision's stored attachment downloaded and decrypted successfully.
- An ordinary authenticated owner could not update or delete history. The second account could not read the owner's history.
- Fixture cleanup succeeded. Both generated accounts were deleted and their absence verified. Existing user accounts and records were not test targets.

Account provisioning and cleanup used server-side admin credentials. All vault, document, history and storage assertions used ordinary authenticated clients. Output suppresses credentials, recovery secrets and sensitive backend responses.

## Reproduction

From the repository, with the approved production configuration present in ignored `.env.local`:

```powershell
node --env-file=.env.local scripts/test-hosted-disposable-accounts.mjs --run-hosted-test --documents
```

This explicitly creates and removes disposable production accounts and synthetic encrypted data. Run only with authorization for that target. Omit `--documents` to run the core hosted workflow instead.

## Limits

These are real database/storage API and SQL checks, not full hosted browser acceptance. Browser unlock was interrupted by focus loss and Cold Lock; no security protection was disabled to obtain a passing result. Physical-device acceptance and independent security review remain open.

Snapshots are immutable to authenticated application clients while the record exists. They are not digitally signed or protected from database administrators. Record deletion cascades history. Existing records have a baseline of their current revision, not reconstructed past revisions.

Local screenshots: `docs/document-production-tests.png` and `docs/documents-deployment-ready.png`.
