# Hosted backend acceptance — 8 October 2026

Result: PASS. `test-hosted-disposable-accounts.mjs --run-hosted-test` exited 0 against the configured production Supabase project.

Two randomly named, temporary accounts were created through the Auth admin API and signed in with ordinary user clients. Administrative credentials were used only for account provisioning and removal. Tests used generated sample data, not existing user vaults. Credentials, recovery phrases and sessions were not printed or written to the report.

Verified through real Auth, database RPC/PostgREST and object-storage requests:

- Two distinct, initially empty authenticated accounts.
- Vault creation and persistence; local unlock of the stored envelope using its generated recovery phrase.
- Client-encrypted record and file upload, persisted record retrieval, local payload decryption and downloaded-file decryption matching the original sample.
- Account B denied access to account A's vault, record and file; denied edit/delete RPCs. An attempted foreign storage removal left the owner's object intact.
- Persisted edit decrypts correctly; stale-revision edit rejected.
- Record deletion removes record and file metadata.
- Generated record/object/vault cleanup succeeded. Both temporary Auth accounts were removed and their absence verified.

Scope limits: this was an API/service test, not a browser UI test. It does not verify signup email delivery (temporary accounts were admin-confirmed), MFA, browser reveal timing, physical-device recovery, sharing, signed history or independent security review. The new asset graph RPC was verified separately with rollback-only production SQL tests; this runner exercises the core V5 record/file workflow.

No production user record or account was selected for modification.
