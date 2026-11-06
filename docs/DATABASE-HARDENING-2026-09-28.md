# Database hardening — 28 September 2026

## Implemented locally

`20260927_ciphertext_envelopes.sql` rejects malformed encrypted envelopes on vault key wrappers, records, file metadata/key wrappers and trusted-person payloads. It rejects plaintext JSON objects, unexpected fields, unsupported versions/algorithms, malformed nonces and invalid base64 lengths. The client applies the same base64 length requirement.

These are format constraints, not proof that bytes were encrypted. AES-GCM authentication and decryption remain client responsibilities. File object contents are not inspected by these database constraints.

The pinned PGlite runner applies the actual three V5 migrations to disposable PostgreSQL. SQL tests cover cross-account record and storage-policy isolation, anonymous denial, stale revisions, transactional deletion, cleanup-job creation, malformed envelopes and rejection through the update RPC. It also runs schema readiness inspection. No customer data, credentials, Docker or network target is used.

## Deployment status and limits

### Verification evidence

- Database runner: all three SQL suites and schema readiness passed.
- Focused ciphertext boundary, account-to-record and vault-session checks: 21 tests passed.
- Registry audit: zero reported vulnerabilities. ESLint, production build and artifact checks passed.
- Latest full release run on 28 September at 11:04 local time: **PASS**, exit code 0. All 154 tests across 33 files passed (Vitest duration 81.06 seconds), followed by all database checks, production build and artifact checks. The preceding audit reported zero vulnerabilities and ESLint passed with zero warnings.
- Before that release run, the isolated crypto suite passed all 14 tests in 21.98 seconds. Earlier runs had a password-rewrap timeout, a separate wrong-password timeout and one worker-start timeout. These did not reproduce in the latest complete run; their underlying environmental cause is not proven.
- The multi-KDF password-rewrap test uses the existing suite-wide 60-second limit rather than its shorter 30-second override. No production KDF parameters, assertions or test coverage were weakened. Node local-storage and jsdom navigation warnings still appear in UI tests; they did not fail this run.

The new migration was **applied to production on 28 September 2026**, after the user authorized the production-migration step. All four constraints were separately verified as validated. See `PRODUCTION-VALIDATION-2026-09-28.md` for live evidence and remaining acceptance work. Local tests use minimal auth/storage fixtures and do not validate Supabase JWT issuance, hosted API behavior, signed URLs or real object downloads. Cleanup-job insertion is tested; worker scheduling/execution is not established by this test.

Constraints are added `NOT VALID`: all new inserts and updates are checked immediately, while existing rows are preserved without a scan or rewrite. Updates of malformed historical rows can fail after installation. Historical validation is an explicit remaining gate; schema presence alone does not establish it.

## Rollout procedure

1. Run `npm run verify` and take a recoverable encrypted backup of the target environment using the established backup process.
2. Apply the migration to staging first. Run `supabase/tests/v5_schema_readiness.sql`; all `ready` fields must be true. `historical_rows_validated` initially remains false.
3. Inspect aggregate malformed-row counts with `supabase/tests/ciphertext_preflight.sql`. It returns counts only, never encrypted values or user identifiers. Do not print PostgreSQL failing-row details into logs.
4. If counts are nonzero, investigate the client/version compatibility and repair through the trusted client. Do not delete or replace encrypted data with placeholders. Confirm compatibility before a production rollout.
5. Once every count is zero, separately validate the four named constraints with `ALTER TABLE ... VALIDATE CONSTRAINT ...` in a reviewed maintenance change. Validation can scan large tables; schedule accordingly.
6. Test the actual hosted account-to-record flow with isolated test accounts: create vault, upload/download and decrypt file, reveal/hide, edit, delete, denied cross-account reads/writes and cleanup execution.
7. Obtain approval for this specific production migration before applying it, then repeat readiness and live acceptance checks.

An independent security review, backup restore evidence and physical-device recovery testing remain launch gates. This change does not certify the entire backend as production-ready.
