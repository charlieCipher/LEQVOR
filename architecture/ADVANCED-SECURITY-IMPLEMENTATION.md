# Advanced security — item 7

9 October 2026. Functional work preserves the existing UI and stylesheet.

## Passkey pilot

Supabase's official passkey documentation labels native support experimental and requires supabase-js 2.105.0 or later: https://supabase.com/docs/guides/auth/passkeys . This increment pins 2.105.0, adds the native authentication/registration/list adapter, and connects the existing login button and security dialog. No homemade WebAuthn verifier or substitute session token is used.

The public build flag VITE_ENABLE_PASSKEYS must equal the string `true`; absent/false keeps the entire pilot disabled, including SDK experimental opt-in. A secure context, WebAuthn browser primitives and actual SDK methods are also required. Unsupported browsers retain password login. Provider errors and cancellations are sanitized. Registration requires a confirmed authenticated account and uses the existing password/MFA reauthentication form. The Supabase service remains responsible for challenge, signature and credential validation.

A passkey authenticates an account; it does not obtain the vault master key, unwrap any vault key, bypass MFA or bypass Cold Lock. Sensitive record/share operations retain their existing server-side recent-password/MFA checks. Synced credentials do not establish this particular device as trusted. No automatic trusted-device registration is implied.

Production enablement is a separate rollout action: confirm the chosen stable WebAuthn relying-party ID and exact HTTPS origin, configure Supabase's passkey settings, enable the public build flag, then perform registration/sign-in on a real authenticator. Changing RP ID later invalidates existing credentials, so do not silently choose a parent domain, Vercel team domain or localhost origin. The current production website is leqvor.vercel.app; the future app.leqvor.com target is a different RP decision.

The agent must not create a user's credential or complete biometric/PIN registration on their behalf. Real ceremony acceptance therefore remains pending the user/device, rather than being inferred from mocked SDK tests. No production authentication settings were changed in this increment.

## Remaining item 7 work

- Trusted-device enrollment and revocation tied to verified device possession, separate from synced account passkeys.
- Server-enforced general Shield policy for exports, recovery changes and other high-risk operations. The deployed manual-review invitation approval is scoped to selected records and is not a universal Shield implementation.
- Signed-history foundation is deployed and hosted-tested as described below; integration of other actual operations remains pending. Record-history snapshots remain encrypted and immutable to clients but are not signed.
- Hosted/physical authenticator acceptance and adversarial tests for the production configuration.

No duress feature is introduced. No “trusted”, “Shield active” or “verified history” state should be inferred from this pilot.

Validation: all 263 regression tests across 64 files passed, along with lint, build/artifact checks and an SDK-upgrade hosted two-account sharing/HTTP download/revocation/isolation run. Disposable accounts and records were removed. Dependency audit reported zero vulnerabilities. CSS artifact remains index-58SJVvnB.css; the existing main-bundle warning remains. These checks validate the disabled pilot and integration boundaries, not a real passkey ceremony or completion of all item 7 work.

## Signed account-history foundation (deployed)

`20261009_signed_security_history.sql` adds one server-only append function; authenticated clients retain owner-only read access and cannot insert/update/delete events. It also changes the history owner foreign key to cascade on confirmed account deletion, rather than leaving vault-independent history that blocks deletion. No recipient permissions are added. The user approved production migration, deployment and two-account tests; the migration succeeded before API/frontend deployment.

The initial factual event is SECURITY_HISTORY_REVIEWED, with a null device ID. A VMK-encrypted account signing identity signs a domain-separated canonical event/hash using ECDSA P-256/SHA-256. The fixed-project API authenticates the exact bearer token, requires fresh password authentication, reads the owner signer and verifies the real signature before invoking the privileged database function. SQL rechecks MFA/assurance, signer identity and the expected previous head while serializing on the account row. Replay/fork/stale writes fail; unsigned legacy streams require a separate explicit migration. No plaintext vault details, key material or bearer tokens are persisted in events.

The existing Security Timeline dialog verifies the complete chain against the locally decrypted signing identity and a caller-held checkpoint. Existing history without an independent checkpoint is UNANCHORED and its rows are withheld. Invalid imports never replace a good saved checkpoint; Cold Lock/unmount discard late results. Only opaque account ID, sequence and hash are retained in browser storage; users can keep this public checkpoint offline and import it on another client. Browser storage alone is not protection against a compromised client. Account signatures do not prove device possession, legal authority or that unrelated operations occurred.

Scope limits: only explicit history reviews are recorded initially, not exports, recovery/device changes or all record accesses. The verification limit is 10,000 events. Signing-key rotation, independent checkpoint distribution/backups and reconciliation after a committed request whose response was lost need additional design; fail closed rather than adopt a server-supplied head. A server can withhold events; retained checkpoints detect changes/truncation, not guarantee availability. Generic Shield and actual trusted-device enrollment remain unfinished.

Local validation: 274 regression tests across 67 discovered files passed, plus four newly added dialog tests passed in a focused run after discovery. The final focused security run passed all 14 tests. Real-crypto API/service tests reject altered signatures, wrong owners, stale authentication, unanchored/tampered/truncated streams and Cold Lock uploads. PostgreSQL checks cover server-only writes, owner/foreign reads, MFA, replay/fork rejection, legacy streams and deletion lifecycle. Encrypted restore, lint, build/artifact and release configuration passed. Stylesheet remains index-58SJVvnB.css.

Hosted testing found a genuine transport behavior: using SQLSTATE 40001 for an expected stale head caused the managed PostgREST transaction runner to retry until timeout. Supabase documents this behavior: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b . `20261009_security_history_conflicts.sql` changes only that function's expected-conflict code to PT409, retaining its owner, security gates and EXECUTE permissions. The matching API handles PT409 as HTTP 409. Both migrations succeeded in production. Other pre-existing custom 40001 business-conflict branches require a separate review; they were not changed in this increment.

Corrective release 94c8cc8 is Vercel Production Ready (9NvUJm4CfQiT9xwR4qvYQpci7RBu), assigned to leqvor.vercel.app. The hosted ordinary-user workflow passed encrypted Insurance/file edits and sharing/owner authorization before the focused history run. The final `--architecture --security-history --security-history-only` run passed real ECDSA append, independent retained-head verification, stale checkpoint rejection, unanchored-history withholding, replay/tampered-signature/plaintext rejection and cross-account isolation against the deployed HTTP endpoint. A network timeout interrupted one account's deletion; a scoped cleanup retry confirmed it contained only history fixtures, removed it and verified Auth absence. All generated accounts were removed; no personal records were touched. Browser-dialog and physical authenticator acceptance remain open.
