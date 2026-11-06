# Independent security review brief

Status: prepared for a reviewer; no independent review has been performed.

## Scope and boundaries

Review the LEQVOR client, provider adapters, V5 cryptography, session state, Supabase migrations and object policies. Begin with revision `9c9065c`; obtain a fresh revision and diff if implementation changes. Use isolated test accounts and synthetic documents. No real family records, recovery phrases or production private keys should be provided to the reviewer. Agree written scope and test window before any intrusive hosted testing.

## Required evidence

1. Prove separation between account authentication and local vault unlock. Review password KDF costs, recovery entropy, wrapper binding, AES-GCM nonce uniqueness and authenticated metadata.
2. Attempt cross-account table, RPC and storage access; test owner substitution, stale revisions, orphan uploads, missing wrappers and concurrent edits/deletes.
3. Trace decrypted data through Reveal, lock, timeout, blur, unmount, async cancellation, export and error reporting. Inspect logs and persistent browser storage for synthetic secret markers.
4. Verify recovery on a second physical device, then restore ciphertext plus wrappers and file objects into an isolated backend. Confirm revoked access stays revoked after restore.
5. Review recipient-key identity verification, grant substitution, key rotation and revocation before enabling sharing. Establish honest limits for previously downloaded plaintext.
6. Review server-generated WebAuthn challenges, origin/RP-ID binding, challenge expiry and replay rejection before enabling passkeys. Test step-up authorization and trusted-device revocation.
7. Verify Shield approval signatures bind actor, operation, target, nonce and expiry. Reject self-approval where policy forbids it, replay, altered targets and revoked approvers.
8. Verify signed history against trusted device keys and anchored checkpoints; test cross-record splicing, truncation, reordering and key substitution.
9. Test CSP, DOM injection, dependency boundaries, secrets exposure and auth callbacks on the deployed origin. Verify email/reset/MFA behavior separately from HTTP shell checks.

## Physical Vivo acceptance

In Chrome with TalkBack enabled: navigate login by swipe, confirm labels and password visibility announcements, create only a synthetic vault, retain recovery material offline, add a synthetic record/file, reveal then background the app, verify concealment, edit/delete, rotate orientation and enlarge text. Repeat recovery on another trusted device. Record device model, Android version, browser version, date, outcome and defects without recording passwords or recovery material.

## Deliverable

Require reproducible findings, severity, affected revision, remediation evidence and independent retest. No audit badge, compliance claim or production-readiness claim should be based on this brief or on automated tests alone.
