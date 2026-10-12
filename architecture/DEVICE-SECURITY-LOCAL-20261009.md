# Device registration and security review — local release candidate

9 October 2026. User selected `leqvor.vercel.app` for passkeys and confirmed there is no separate cloud backup destination. The earlier deployment hold remains active. This work is local; no production SQL, configuration mutation, hosted writes, Git push or deployment is included.

## Implemented

The existing Trusted devices dialog now supports registration, a fresh proof of possession, and revocation after account password/MFA verification. A separate ECDSA P-256 signing key is generated in the browser with a non-extractable private CryptoKey and retained through IndexedDB structured cloning. Only its public key leaves the client. No VMK, account credential or plaintext label is placed in the device registry. Failure to persist the key blocks enrollment.

The database issues a random challenge bound to the owner, vault, proposed device key, current authentication session, operation and five-minute expiry. The fixed-project API authenticates that exact bearer token, verifies the device signature and account-signed history event, then invokes a server-only transaction. SQL rechecks fresh authentication/MFA, the exact challenge, its session, expiry and single-use status. Owner-only RLS and denied direct table writes remain the database boundary. Pending challenges are bounded and old challenges are removed when a new one is created.

Enrollment, proof verification and revocation append DEVICE_ENROLLED, DEVICE_PROOF_VERIFIED and DEVICE_REVOKED events to the account's signed hash chain in the same transaction as the operation. A stale history head rolls back the operation and challenge consumption. The general history-review endpoint cannot submit device events. The existing timeline verifies and displays the three additional event types. The previously prepared pending-checkpoint journal covers lost responses; unverified history prevents a new device mutation. Locks are taken in account/vault/challenge order to avoid inversion with account deletion and owner revocation.

Revocation disables future proofs and removes pending challenges for that registration. Removing the current browser also removes its locally stored signing key after server success. It does **not** terminate Supabase sessions, delete ciphertext, recover previously disclosed information, grant record access or unlock a vault. This is browser-profile possession, not hardware attestation or a guarantee that the key cannot be cloned through a compromised browser profile. Authenticated-session revocation and device-gated high-risk operations remain separate integration work.

## Recovery update fix

Review found that a signed-in client could directly update vault wrappers. The prepared password-guard migration revokes client table UPDATE and replaces the application's password-wrapper writes with an owner-only function. It requires recent password authentication and the configured MFA level, checks the previously observed wrapper nonce, accepts only the current Argon2id/password-wrapper fields, and preserves the recovery wrapper/salt. The existing password-change form performs fresh account verification first and checks Cold Lock before upload. Recovery-based replacement also uses the guarded function; an old authentication session must sign in again. No recovery-secret rotation or general Shield approval is implied.

## Prepared migrations

- `20261009_record_sharing_conflicts.sql` from the preceding increment.
- `20261009_verified_devices.sql` adds owner-only registry/challenge reads and server-only verified mutation/history functions.
- `20261009_vault_password_guard.sql` removes direct vault UPDATE and adds the guarded password replacement.

The matching API and frontend must ship together after explicit release authorization. Earlier clients use the old direct password update and must reload after rollout. These migrations have not been applied to production.

## Validation and acceptance boundaries

Focused tests cover real ECDSA device/account signatures, incorrect owners/sessions, expiry, replay, changed challenges, revoked/in-flight requests, MFA and cross-account isolation, direct-write denial, and atomic rollback on history conflict. Dialog/service tests cover fresh verification, storage failure, Cold Lock and revocation. A full PGlite database snapshot was restored into a new engine after closing the original: recovery decrypted its encrypted record, independently pinned signatures verified, revoked-device state survived, and cross-account reads remained blocked. This is a local engine restore, not a Supabase cloud restore or a physical-device test.

The standalone `npm run check:browser-device` now tests the actual DeviceKeyStore in a disposable real desktop Edge profile. It closes and restarts the browser, loads the retained non-extractable CryptoKey, signs/verifies a proof, confirms private export denial, checks scope separation and duplicate-write rejection, then removes the key. It uses no account or vault secrets and never opens the user's browser profile. This passes for desktop Edge; other browsers/devices and hosted enrollment are not implied. Browser-profile storage does not establish hardware key custody. No visual redesign or stylesheet change is included.

Validation completed: all 312 regression tests across 76 discovered files passed. Two additional password-control tests passed separately after suite discovery. Database authorization/atomicity checks, both local recovery/restore paths, lint, build/artifact validation and release configuration passed. Dependency audit reported zero vulnerabilities. The stylesheet is still `index-58SJVvnB.css`; the existing large JavaScript bundle warning remains.

Subsequent seven-item continuation: all 316 tests across 77 discovered files passed. The full-engine restore test now writes the database snapshot and encrypted object to separate local disk files, closes the source engine, restores into a fresh engine, decrypts record/graph/file payloads, retains immutable revisions and revoked grants/devices, verifies pinned signed history and rejects cross-account access and tampered ciphertext. The real Edge key-storage check also passed. Passkey ceremonies are fixed to the chosen permanent origin and SDK-wrapped cancellation is sanitized. These changes remain local; no cloud backup, production passkey configuration, hardware authenticator ceremony or deployment is represented as complete.

## Still open

General Shield policy/approver setup and operation-level consumption for export, critical sharing, recovery changes and emergency access remain unfinished. No Shield setting has been enabled or represented as active. The current manual-review invitation workflow remains specific to selected records.

Passkey production configuration should use RP display name **LEQVOR**, RP ID **leqvor.vercel.app**, and the exact origin **https://leqvor.vercel.app**. The public pilot remains disabled until coordinated configuration and release. Supabase currently labels its native support experimental: https://supabase.com/docs/guides/auth/passkeys . A real authenticator ceremony still needs hands-on user interaction; mocked tests do not complete it.

Cloud backups cannot be scheduled or restored without a separate destination. Cleanup has an existing configured worker path but its live schedule/results have not been reverified during this deployment hold. A broader backup must include all ciphertext tables, grants/revocation state, wrapped keys, history/checkpoints and encrypted objects; the user recovery-package export alone is not a complete infrastructure backup.

Hosted browser workflows and recovery on another physical device remain unverified for this increment. Vivo/Android/GrapheneOS and screen-reader acceptance require those environments. This self-review and its tests are not an independent security review. Final operator details and reviewed legal documents are still being prepared by the user; the interim legal pages remain interim.
