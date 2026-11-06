# Vault entry investigation — 5 October 2026

The user reported the generic screen error after verifying 24 recovery words. Reloading and entering the vault password then opened the workspace. The original exception was not retained in the available browser tab, so its cause is not conclusively identified.

Found a deployment-sensitive boundary: Workspace was React.lazy loaded only after vault setup/unlock. An open pre-deployment page could request an obsolete workspace asset after saving its new vault. The fix statically imports Workspace and VaultGate, loading those modules before setup rather than after it. Authentication, MFA and vault-unlock rendering gates remain unchanged. No automatic refresh, duplicate creation, secret persistence or weakened Cold Lock was introduced.

Validation: a new integration test uses the real Workspace and VaultGate, with synthetic crypto/database adapters, to verify first-time creation enters the empty workspace with exactly one creation and one unlock. It passes under StrictMode. Ten tests across vault entry, auth boundary and screen boundary passed. Lint and release build/artifact checks passed. This is not a reproduction of the user's original exception or a hosted encrypted CRUD test.

Tradeoff: initial main bundle is about 176 kB gzip, instead of deferring workspace code. Vite reports its generic >500 kB uncompressed chunk warning; build and security checks pass.
