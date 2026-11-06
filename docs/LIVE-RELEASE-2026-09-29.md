# Hosted LEQVOR release — 29 September 2026

## Verified deployment

- Production: https://leqvor.vercel.app
- Repository: charlieCipher/Aureva, main, revision `9c9065cf4de937ca4103764bd87b79cac6852cd8`.
- Vercel project is now named `leqvor`; deployment `9zMsqJQemQocm2VL8Yzbu3Ju1EQm` is Ready.
- `/auth` and `/app/vault` returned the LEQVOR shell over HTTPS and passed the deployed security-header checks.
- The live login page exposes sign-in, account creation, password reset and the 16-character new-password guidance. Passkeys remain explicitly unavailable.
- Anonymous requests to vaults, records, record_files, trusted_people and ciphertext_cleanup_jobs were denied by the hosted backend.

The initial build rejected additional Vercel-injected client variables. Automatic system-variable exposure was disabled. Vercel still injected `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG`; the release runner removes that unused process variable before loading Vite configuration. All other unexpected VITE variables remain rejected. A local canary build passed and did not contain the injected marker. Six release-gate regression tests and focused lint passed after the diagnostic change; the previous complete Node 24 suite passed 163 tests.

## Authentication configuration applied

Supabase project `awdsyhxdnyfilnzamflt` now uses Site URL `https://leqvor.vercel.app` and the exact same production redirect URL. The obsolete Aureva redirect was removed. The previously authorized local URL `http://127.0.0.1:5173` remains. No wildcard redirect was added, and no password, MFA or email-confirmation protection was disabled.

## Remaining acceptance

The user supplied two controlled test email addresses. Actual sign-in/verification must complete before testing account-owned vaults. Email addresses alone do not establish authenticated sessions. No authenticated hosted CRUD, file upload, recovery, or cross-account result is claimed here.

Supabase's backup page explicitly reports that the Free Plan does not include project backups. No separate backup destination or server credential is configured. No scheduled backup, scheduled cleanup or cloud restore is claimed. A future restore must target an isolated database, never overwrite this production project during a drill.

Live sharing, trusted-device enrollment, passkeys, Shield enforcement and signed-history integration remain unfinished. The deployed disabled controls must remain disabled until their server authorization and end-to-end behavior pass acceptance.

Physical Vivo/TalkBack testing and an independent security review remain external acceptance gates. See INDEPENDENT-REVIEW-BRIEF.md. Deployment is not certification of the full architecture.
