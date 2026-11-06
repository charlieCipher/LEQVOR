# Hosted acceptance and sharing registration — 6 October 2026

## Completed

Executed `supabase/tests/hosted_rollback_acceptance.sql` against project awdsyhxdnyfilnzamflt. PASS: synthetic vault creation, record/file-metadata creation, owner update/delete, stale revision rejection, cross-identity read/write denial and cleanup enqueue. Authentication claims were set explicitly under the authenticated database role; this is database authorization testing, not real Auth login or Storage API testing. All fixtures rolled back.

Applied user-approved `20261006_sharing_identity.sql` to production. Executed rollback-only `sharing_identity.sql` there successfully: owner binding, foreign vault denial, no replacement of registered key, rejection of plaintext private keys/invalid envelopes, direct deletion denied. No real user's key was registered by the agent.

Connected People → sharing identity panel → service → provider → hosted registration RPC. The client generates the key pair, encrypts the private key using the VMK and authenticates the public/private binding on retrieval. UI shows account ID and public fingerprint only. Account reauthentication precedes user-triggered enrollment. Registration is not recipient identity verification and does not grant record access.

Local validation: five PostgreSQL test scripts plus schema readiness passed; 20 crypto/service tests and four component tests passed; release build and artifact checks passed. Lint passed. Existing large-bundle warning remains.

## Precise remaining work

- Invitation lifecycle, independently verified recipient identity/fingerprint pins, selective record grants, revocation, recipient inbox and encrypted-file sharing.
- Passkeys, trusted-device enrollment, Shield and signed-history integration.
- Actual hosted sign-in → unlock → file upload/download → reveal flow. Admin access does not recover an existing vault's key.
- User now requests backup/cleanup activation, but has no separate backup destination. Vercel shows only the public frontend Supabase variables; server URL/key and CRON_SECRET are absent. Requested private entry, left cleanup disabled and did not add a failing schedule.
- Vercel reports account single-factor authentication. No account authentication settings were changed.
- This was a developer review. Physical Vivo/TalkBack testing and independent audit have not been performed.

No application styles, login design, customer records or interim legal wording were changed.
