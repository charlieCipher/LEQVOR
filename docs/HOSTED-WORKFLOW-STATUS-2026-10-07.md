# Hosted workflow acceptance

## Observed results

- Hosted /app/vault displayed the sign-in screen during this check. No authenticated browser vault was available.
- All 187 existing tests passed, followed by three new hosted-runner guard tests.
- Five local PostgreSQL suites passed. These are not new hosted database results.
- Local disk backup, fresh-database restore, decryption and isolation checks passed. This is not a cloud restore or physical-device test.
- Hosted HTTPS routes and required security headers passed.
- Lint passed before the final test-only addition.

## New runner

`scripts/check-hosted-workflow.mjs` exercises actual Supabase Auth identity validation, vault insertion/recovery unlock, ciphertext storage uploads/downloads, record creation/reveal/update/deletion and cross-account denial. It uses the production crypto module, regular authenticated sessions and the public project key; no service-role bypass is used.

It requires two distinct **dedicated empty test accounts** and privately supplied `LEQVOR_TEST_ANON_KEY`, `LEQVOR_TEST_TOKEN_A`, `LEQVOR_TEST_TOKEN_B` environment variables. Never put tokens in chat, command arguments, committed files or reports. It refuses accounts with existing vaults, records or trusted people. It deletes only random fixture records/objects/vault IDs from its own invocation. Normal queued deletion bookkeeping may remain for the scheduled worker.

Invocation without those variables correctly returned BLOCKED before any hosted write. The real API run remains unexecuted. Even a successful API run would not constitute browser UI acceptance; the separate sign-in/unlock request remains pending.

## Remaining

Authenticated hosted browser flow; real two-account runner execution; invitations/grants/revocation; live advanced security integrations; cloud backup destination/restore; authenticated cleanup-run evidence; physical-device and independent review. No existing user vault was reset, unlocked or modified during this work.
