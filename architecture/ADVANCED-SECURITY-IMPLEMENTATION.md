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
- Signed security-event persistence, hash-chain/checkpoint verification and integration of actual verified events into the existing timeline. Record-history snapshots remain encrypted and immutable to clients but are not signed.
- Hosted/physical authenticator acceptance and adversarial tests for the production configuration.

No duress feature is introduced. No “trusted”, “Shield active” or “verified history” state should be inferred from this pilot.

Validation: all 263 regression tests across 64 files passed, along with lint, build/artifact checks and an SDK-upgrade hosted two-account sharing/HTTP download/revocation/isolation run. Disposable accounts and records were removed. Dependency audit reported zero vulnerabilities. CSS artifact remains index-58SJVvnB.css; the existing main-bundle warning remains. These checks validate the disabled pilot and integration boundaries, not a real passkey ceremony or completion of all item 7 work.
