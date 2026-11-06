# Supabase rollout — 14 September 2026

Target: existing `Aureva` project, reference `awdsyhxdnyfilnzamflt`, main production branch.

## Verified

- The configured publishable key reaches the authentication settings endpoint (HTTP 200).
- Before migration, REST lookups for `vaults` and `records` returned PGRST205.
- Dashboard SQL inspection found five legacy public tables: `asset_assignments`, `assets`, `family_members`, `legacy_statements`, and `profiles`. Each has RLS enabled.
- Existing storage bucket `vault` is private.
- The V5 foundation and record-transaction SQL executed together in `BEGIN ... ROLLBACK` successfully. No schema changes were committed by this check.

## Committed after explicit user authorization

Applied `supabase/migrations/20260911_continuity_v5.sql` followed by `supabase/migrations/20260913_record_transactions.sql`. The dashboard execution combined their statements into one transaction, removing the intermediate transaction boundaries and notifying PostgREST before the final commit. Supabase returned “Success. No rows returned.” No additional production changes were performed.

The change adds ten tables, a separate private `vault-v5` bucket, owner-scoped RLS, record/file atomic creation, revision-checked edit/delete RPCs, and a server-only ciphertext cleanup queue. It does not migrate, rename or delete legacy records. The cleanup worker is not scheduled by these migrations.

The user explicitly authorized these two migrations only. An initial usage-limit block delayed execution; the subsequent commit succeeded. These were executed through dashboard SQL, not the CLI migration tracker.

Read-only postflight checks confirmed:

- All ten new tables exist with RLS enabled and forced.
- The private `vault-v5` bucket has the 16,000,000-byte limit and JSON MIME allowlist.
- `records.revision` is a non-null bigint; all three record RPC signatures exist.
- Authenticated direct record UPDATE/DELETE is denied; anonymous record SELECT is denied.
- Authenticated clients cannot read the cleanup queue.
- Eight owner policies and four V5 storage policies exist.
- All five legacy tables remain; the original `vault` bucket remains private.

## Remaining acceptance

1. Schema existence, RLS flags, bucket configuration and privilege checks have passed. Full adversarial policy behavior remains unverified.
2. Verify REST recognizes `records.revision` while anonymous row reads remain denied.
3. Keep actual execution results separate from simulated client tests.
4. Run destructive and account-fixture scenarios only in a disposable staging environment. Existing SQL fixture scripts are not production acceptance scripts.
5. Complete real sign-in, MFA, vault setup, record/file CRUD and recovery with controlled accounts before claiming backend readiness.

Schema deployment alone does not validate object upload/download, cross-account API access, recovery on another device, backups or cleanup scheduling.

## Authentication configuration — 20 September 2026

With separate action-time confirmations, changed the Email provider minimum password length from 24 to 16 (reopened settings verified 16), and added the exact `http://127.0.0.1:5173` redirect. The existing production Site URL and redirect remain unchanged. Email confirmation remains enabled.

Submitted one password-reset request through the local application to the user-designated test inbox. The application returned its generic success response; inbox receipt and completed reset are not yet verified. New signup, live password login and authenticator enrollment still require user participation. No passwords or OTPs were requested in chat.

MFA enrollment now uses the authentication adapter and only reports successful enrollment after both verified factor status and AAL2 are confirmed. Eighteen focused authentication tests and the production build passed; mocked responses are not live authentication evidence.
