# Offline recovery verification

Requires Node.js 22 or newer and the installed project dependencies. Keep a reviewed copy of this project and its lockfile alongside your encrypted backup; install dependencies before disconnecting from the network.

Run from the project directory:

```
node scripts/verify-recovery.mjs "path/to/encrypted-vault.leqvor"
```

Enter the 24-word recovery secret at the hidden terminal prompt. Do not pass it in command arguments, environment variables, or redirected input. The verifier uses no account session, database, or network service. It decrypts each record and attachment in memory, clears attachment byte arrays, and reports counts only. It writes no recovered plaintext files.

The command rejects malformed packages, mismatched manifests, duplicate IDs, cross-vault rows, missing/extra attachment objects, invalid file references, incorrect secrets and unauthentic ciphertext. Packages are limited to 100 MB and 10,000 entries per collection in this first verifier.

The manifest is an unkeyed checksum, not a trusted signature. Verification cannot prove backup freshness, identify entire rows removed before a manifest was recomputed, or authenticate relationships not included in existing encryption AAD. Independent authenticated checkpoints remain necessary. JavaScript cannot guarantee forensic memory erasure.

This is a recovery drill, not a restore/import utility. It does not modify the account or replace the live vault. A standalone distributed recovery bundle, importer, independent checkpoints and staging restore exercises remain pending.

## Fresh-process drill evidence

The automated recovery suite now writes a synthetic encrypted package to disk and starts an independent Node process. That process reads the disk copy and receives only the synthetic recovery phrase through IPC, not command-line arguments. It independently unwraps the vault key and authenticates/decrypts the record and attachment. It returns counts only, emits no plaintext console output, and the fixture is removed afterwards.

All six recovery-package tests passed, including this drill. The existing record lifecycle and cleanup suites also passed before the new drill was added. This is evidence of process-independent offline recovery, not a physical second-device test, database restore, scheduled backup, or deployed cleanup job.

Deployment still needs a named trusted scheduler and a separate backup destination with server-side secret provisioning. No production backup was copied and no recurring job was installed by this drill.

## Fresh database restore drill

Run `npm run check:restore` for an additional synthetic PostgreSQL restore exercise. This is included in `npm run verify`. It uses the actual V5 schema in disposable PGlite instances, without Docker, network access or production credentials.

The drill encrypts a record, trusted-person entry and attachment, persists their rows, and writes a recovery package containing ciphertext and wrapped keys to a temporary disk file. It closes the source database before reading the file and restoring into a fresh database. A malformed attachment reference must roll back the entire restore transaction, including its fixture identity. A successful restore must preserve the package manifest, decrypt with the recovery phrase and remain inaccessible to another authenticated identity under RLS. Temporary files are removed at the end; test output contains results only.

The attachment ciphertext travels in the package and is decrypted from there; this does not exercise an S3/Supabase object upload or download. This is a core vault recovery-package drill, not a complete infrastructure backup: subscriptions, auth credentials, grants and signed audit history are outside this package. It is not a supported production import command or proof of scheduled backups. Physical-device recovery, cloud restore, a separate backup destination and trusted job scheduling remain pending.
