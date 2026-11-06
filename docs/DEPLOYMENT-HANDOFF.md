# LEQVOR deployment handoff

Domain update, 29 September: at the user's explicit request, `aureva-wheat.vercel.app` has now been removed. Vercel shows only `leqvor.vercel.app`, with Valid Configuration for Production. This supersedes the earlier two-alias observations below; the old alias is no longer a rollback address. No new application release was deployed during this change.

Current free address chosen and assigned at the user's request on 29 September: **https://leqvor.vercel.app**. Vercel confirms Valid Configuration for Production. The existing `aureva-wheat.vercel.app` alias remains available. This domain assignment serves the existing production deployment; the prepared LEQVOR code has not been published. The previously discussed custom target **https://app.leqvor.com** remains optional and requires ownership/DNS configuration.

Existing deployment supplied by the user: **https://aureva-wheat.vercel.app/**. Use the associated existing Vercel project for the update after confirming project access and linkage; no local `.vercel/project.json` linkage was found. Keep its current deployment available for rollback. Read-only HTTPS checks found `/` returns 200, but `/auth` and `/app/vault` return 404 without redirects. The local SPA rewrite configuration addresses these deep links, but it has not yet been deployed or verified on that host.

## Prepared

Vercel project access verified on 29 September after sign-in: team `kalambeshounak-5837s-projects`, project `aureva`, project ID `prj_HqPJMUwnjTFGPkf6LUoHXjG79JgB`, connected repository `charlieCipher/Aureva`. Production tracks `main`; pushing there automatically deploys. Framework is Vite, repository root is selected, and Node 24.x is configured. Existing production revision is `9d90753c9af79edba176eccd4d17a0a193418877`. No push or publication was attempted.

The domain settings now show both `leqvor.vercel.app` and `aureva-wheat.vercel.app`, with valid production configuration. `app.leqvor.com` is not added. Use the selected free origin for deployment checks and exact Supabase auth callbacks before accepting users there; auth configuration has not been changed in this domain-assignment step. Existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables are present for all environments; their values remained masked, so this inspection does not verify their contents. System environment-variable access is enabled.

Run `npm run prepare:release` for a complete local gate followed by an isolated copy of `dist` under `.local-release/candidate-*`. Each candidate includes a SHA-256/size manifest of every copied asset. Later edits to `dist` do not alter that candidate. The manifest detects changes; it is not a signature, an independent attestation or a Vercel deployment package. Candidate and local backend fixture folders are excluded from Git and Vercel uploads. Server-side `.mjs` release/cleanup scripts now participate in ESLint checks.

Latest local verification (29 September): `npm exec --yes --package=node@24 --call "node --version && npm run prepare:release"` passed under Node 24.21.0 with 163 tests across 35 files, all PostgreSQL checks, the restore drill, lint, dependency audit (zero reported vulnerabilities), production build, artifact and configuration checks. Candidate: `.local-release/candidate-GOG5IJ`, with `manifest.json` recording SHA-256 fingerprints. This verifies the local candidate, not the existing hosted version.

Two release blockers were corrected: ESLint now excludes generated `.local-release` candidates, and the release configuration check accepts the exact documented public Vercel framework metadata names. It still rejects unknown browser-exposed names, including Vercel-prefixed secrets, tokens and OIDC tokens. The explicit list follows [Vercel framework environment variables](https://vercel.com/docs/environment-variables/framework-environment-variables); no wildcard exemption is used.

- `vercel.json`: Vite build to `dist`, SPA deep-link rewrites, restrictive security headers.
- `npm run build:release`: rejects missing/unsafe public configuration, builds, then verifies local assets and output exclusions. Both configured keys are checked even when only one takes precedence. This validates key shape/role, not server authentication or key ownership.
- CSP connects only to the reviewed Supabase project rather than every Supabase origin. Changing environments requires reviewing the CSP and release-config allowlist together. There are no external script or font origins in this policy.
- `npm run verify`: dependency audit, lint, all unit/integration tests, disposable PostgreSQL checks, encrypted restore drill and production artifact verification.
- `npm run check:deployment -- https://app.leqvor.com`: read-only check of deployed `/auth` and `/app/vault` responses, enforcing HTTPS, security headers, HTML shell and no redirects. This is a post-deployment check, not evidence that the domain is currently configured.

## Vercel configuration

Use the existing repository root, Vite framework, `npm ci` install command and `npm run build:release` build command. Output directory: `dist`. Retain the configured Node 24.x runtime, now locally verified. The checked-in `vercel.json` supplies the release build command; the dashboard build/install/output overrides were off when inspected.

Set only these browser-build settings in the Vercel project:

```
VITE_SUPABASE_URL=https://awdsyhxdnyfilnzamflt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<existing public publishable key>
```

An existing public anon key may be supplied as `VITE_SUPABASE_ANON_KEY` instead. Never place service-role keys, recovery phrases, passwords or database credentials in `VITE_*`. Do not add server backup/cleanup credentials to the frontend project. Local `.env` files are excluded from upload.

The deployment build does not execute the full release suite: `.vercelignore` excludes tests and SQL fixtures. Run `npm run verify` against the exact source revision before publishing. Retain that revision and its previous deployment for rollback.

## Before switching the public domain

1. Complete hosted acceptance with two controlled accounts: email confirmation/reset, MFA, separate vault setup/unlock, encrypted record and file creation, refresh/recovery, reveal expiry, edit/delete and cross-account denial. SQL schema checks are not substitutes.
2. Configure a trusted server scheduler for ciphertext cleanup and backups to a separate destination, with secrets provisioned server-side. Verify actual execution, restore and retention. The local synthetic restore drill is not a production backup.
3. Test the chosen Vercel deployment in its supported runtime and complete Vivo/TalkBack acceptance. Record unresolved accessibility issues and remediate them before public launch.
4. Keep recipient grants, passkeys/device enrollment, Shield and signed-history operations unavailable until their live integration and authorization are verified. The full architecture is not complete; deployment of the current core must not be presented as delivery of all planned features.
5. Add `app.leqvor.com` to the Vercel project and use the exact DNS records Vercel supplies. Do not change the marketing root domain. Confirm HTTPS certificate readiness before directing users there.
6. Set Supabase Site URL and exact auth redirect allowlist for `https://app.leqvor.com` (the current client passes its origin for signup/reset). Preserve approved URLs until the new flow is verified; avoid broad wildcard redirects. Confirm email delivery and the callback flow on the final domain.
7. Run the deployed-header check and a real account acceptance pass. Arrange independent security review before broad availability or strong security claims.

## Rollback and known limits

Redeploy the previous verified frontend revision if the new release breaks critical flows. Do not revert database constraints or delete ciphertext as a frontend rollback. The V5 migrations were applied through dashboard SQL; reconcile migration tracking before a future CLI push to avoid replaying already-applied SQL.

This is a deployment preparation handoff, not production launch approval. Private preview testing can precede final launch gates. No backup destination, recurring job, independent audit or physical-device result is fabricated by the build scripts.
