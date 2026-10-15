# LEQVOR founder authority: manual work and remaining integration

13 October 2026. Founder authority remains **inactive**. The customer website, account/vault passwords and current customer origin are unchanged. Native builds are local acceptance artifacts, not signed production releases.

Validation: latest full suite **366 tests across 87 files passed**, plus six separate control-service acceptance tests. The archive CLI and bounded-file refinements also passed a subsequent focused run. Lint and customer production build/artifact checks pass; earlier PostgreSQL isolation, encrypted restore and Java/.NET interoperability checks passed. Windows compilation had zero warnings/errors. Execution-journal tests use a real isolated PostgreSQL engine with simulated provider adapters. These results do not replace physical-device acceptance, independent attestation validation, live provider controls or infrastructure-owner bypass testing.

Subsequent replacement-possession increment: 19 focused governance tests passed, lint passed, Java/.NET/Node replacement signing-byte and tampering/slot/expiry acceptance passed. Android built an unsigned APK; Windows built with zero warnings/errors. No OS signing ceremony or device enrollment occurred. The full customer suite was not repeated for this native-only increment; its latest result remains 366 passed.

## Actual laptop readiness check — 13 October 2026

Computer access and read-only diagnostics were completed on the user's laptop. It reports Windows 11 Home Single Language, version 10.0.26300. The native `--check-device` call to `KeyCredentialManager.IsSupportedAsync` returned **true**. This establishes Windows Hello platform availability only; it does not establish enrollment, TPM-backed protection or independently validated attestation. The TPM CIM query was unavailable to this process, so TPM presence/readiness remains unverified. Android connection discovery reported no connected device. No device identifiers, private material or credentials were retained.

The Windows console rebuilt with zero warnings/errors and its public-protocol acceptance passed again. The read-only device mode does not open/create keys, sign, invoke authentication, change settings or activate founder authority:

```powershell
& .local-release/founder-tools/dotnet/dotnet.exe .local-release/founder-windows/bin/net10.0-windows10.0.19041.0/FounderConsole.dll --check-device
```

The founder subsequently completed the local “Create / inspect Hello key” ceremony privately and replied “Done.” The native console reported public key and TPM evidence ready. A read-only `--export-existing-public-evidence <new-local-file>` operation then opened the existing A alias, obtained public evidence and wrote a new file under ignored `.local-release`. It does not create/replace keys, sign requests, enroll identities or activate root authority. No actual public-key identity or attestation certificate is committed to Git.

Structural checks passed: RS256, RSA-2048, public SPKI fingerprint matches, 849 attestation bytes and 14,913 certificate-chain bytes. **Independent chain/TPM attestation verification remains false.** Evidence presence and OS success are not proof of independently verified hardware provenance. There is no root policy containing this actual credential yet. The separate export build passed with zero warnings/errors.

No Windows Hello setup, PIN entry, security setting, device permission or infrastructure owner setting was automated. The user's only identified devices remain the HP laptop and Vivo Y19s; recovery C, separate storage and independent review have not been provided. A was created by the founder; B/C and all founder enrollment remain unverified. Do not mark activation accepted from successful computer access or these structural results.

## Phone preview preparation — 13 October 2026

The user reported Android 15 and connected the phone for file transfer. Windows reported a WPD device named **Y19s 5G** with status OK. No Android debugging connection was present and USB debugging was not enabled. The observed device label differs from the earlier generic Y19s description; hardware provenance still requires actual evidence.

`native/android/prepare-preview.ps1 -CreatePreviewPublisher` created an explicitly local-preview package publisher separate from founder credentials. Its RSA-3072 PKCS12 software key stays under ignored `.local-release/founder-preview-publisher`, with restricted directory permissions and its random password protected using Windows current-user DPAPI. The password is not put in command arguments, printed, committed or uploaded; task-scoped environment exposure is cleared after signing. This publisher is **not** an independently reviewed production release identity, founder key or recovery C. Do not delete/replace it if a phone has enrolled an app-scoped key; application reinstallation/key loss requires the reviewed recovery process.

The APK was rebuilt, aligned before signing, signed and verified with Android SDK apksigner; signature scheme v3 verification and signed alignment checks passed. The package remains non-debuggable, with no Internet permission and Android 12 minimum. Each preparation makes a new preview output directory and retains the original unsigned package. Preview package/hash metadata is local, outside Git. The script refuses incomplete existing publisher state rather than replacing it.

The phone has not yet been shown to install/open the APK or create credential B. Computer-use File Explorer captures produced unavailable click geometry and keyboard inputs did not change the observed focus, so no file-transfer completion is claimed. The preview is prepared for a user-controlled transfer and installation. No phone permission, authentication or installation prompt was automated. Actual KeyInfo and attestation acceptance, local proof/signature operation, independent evidence validation and production publisher review remain pending.

The first installation error was reported for **leqvor-founder-aligned.apk**, the unsigned intermediate, rather than the signed installer. Desktop verification of the signed APK passed specifically for Android 15/API 35; its size is 29,079 bytes. A separate install handoff directory now contains only `LEQVOR-Founder-Approval-Preview.apk`, copied with matching SHA-256. The packaging script places future aligned intermediate files under `.intermediate` to reduce accidental selection. This identifies the incorrect-file attempt; a successful phone installation is still required and not claimed.

## Work completed in code

### Android responsiveness update — 15 October 2026

The user installed/opened preview 0.1.0, saw the key-creation confirmation, then reported no apparent result after confirming. This establishes that the initial tap/confirmation works; it does not establish whether a key was created or which hardware check failed. Do not reset or uninstall the app to investigate.

Inspection found Android Keystore work running on the Activity UI thread. Preview **0.1.1 / versionCode 2** moves key inspection/creation to a worker, serializes the underlying alias operation, gives visible progress/errors and brings status text into view with polite accessibility announcements. Late public-evidence delivery is suppressed after background/session changes; retry inspects an existing alias rather than replacing it. Button errors and obscured-touch rejection now provide feedback without disabling the touch filter, hardware requirements or per-operation authentication. System-bar/cutout insets keep the separate native console controls clear of Android edge-to-edge regions. The customer website/UI is unchanged.

The update uses the same package and local preview publisher certificate as the installed app, so the user should install it **over** the existing application, preserving app data and any local key. The signed update passed Android 15/API 35 signature verification, APK alignment, manifest version/permission inspection, native public-protocol acceptance and lint. The signed APK is 33,175 bytes; only that installer was copied into the local update handoff directory with matching SHA-256. No Internet permission, founder activation or root enrollment was added. The cause and actual device behavior still require the user's update/retest; desktop compilation is not phone UI acceptance.

Android's guidance explicitly advises avoiding AndroidKeyStore operations on the main thread: [Android Keystore system](https://developer.android.com/privacy-and-security/keystore).

### Phone hardware-policy diagnostic — 15 October 2026

After installing 0.1.1, the user reported `Hardware inspection blocked (IllegalArgumentException). Hardware-backed per-operation authentication unavailable; signing blocked`. This is the aggregate app policy rejection, not evidence identifying which capability failed or proving that the entire phone lacks secure hardware.

Preview **0.1.2 / versionCode 3** reports public capability values separately: security level, authentication-required flag, validity duration, hardware-enforced authentication, private-exportability flag and authentication type. The pure Java HardwarePolicy rejects each missing requirement; its JVM acceptance covers accepted TEE/StrongBox configurations and six individually failing conditions. Strong biometric/device-credential type acceptance is explicit. All earlier hardware/per-use/non-exportability requirements remain in force; no compatibility bypass or software fallback was introduced. At this stage the app still enforced the legacy KeyInfo documentation's `-1` representation; subsequent real-device data and AOSP verification identified this interpretation as an application bug, corrected below.

Failed local inspection now retains the existing/generated alias for diagnosis rather than deleting and recreating it. Public challenge metadata is synchronously saved; a persistence failure blocks export while retaining the key. A retained but rejected key is not enrolled or allowed to sign. No key-reset action was added.

The update compiles, passes native protocol/hardware-policy acceptance and lint, and is signed with the existing local preview publisher. APK signature/alignment and Android 15/API 35 signature verification passed. A single signed 0.1.2 installer is prepared in the local diagnostic handoff directory. The user must install it over the existing app and provide the capability message; actual phone eligibility and credential B remain **unverified**. Independent attestation, real signing acceptance and recovery C are still pending.

### Android 15 per-operation timeout correction — 15 October 2026

The actual diagnostic reported `level=TEE, auth_required=true, validity_seconds=0, auth_hardware_enforced=true, private_exportable=false, auth_type=3, accepted_auth_type=true`. The sole failing condition was the app's timeout representation check. This was an application interpretation bug, not a demonstrated failure of the phone's secure hardware.

The [Android 15 Keystore2 implementation](https://android.googlesource.com/platform/prebuilts/fullsdk/sources/+/refs/heads/androidx-constraintlayout-release/android-35/android/security/keystore2/AndroidKeyStoreSecretKeyFactorySpi.java) initializes the auth validity value to zero when AUTH_TIMEOUT is absent and passes it into KeyInfo unchanged. The [modern builder API](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setUserAuthenticationParameters(int,%20int)) also uses zero to request per-operation authentication, whereas legacy KeyInfo documentation describes minus one.

Preview **0.1.3 / versionCode 4** recognizes both per-operation representations (0 and -1), while still rejecting positive authentication windows, other negative values, software/unknown security levels, missing/hardware-unenforced authentication, exportable keys and unsupported authentication types. The native signing path still requires the actual Signature CryptoObject and successful user authentication. It never substitutes a recent screen unlock for a signature authorization. No key replacement, software fallback, root activation or enrollment was added.

JVM acceptance reproduces the reported TEE/type-3/zero case and covers both representations under every other failing check, plus timeouts -2, 1, 5, 30 and integer extremes. Native compilation/protocol acceptance, lint, signed alignment and Android 15 signature verification pass. The update is signed by the same local preview publisher and preserves the package/alias. User retest and public evidence export are still required, followed by independent attestation and real signature acceptance before enrollment.

### Phone B public evidence received — 15 October 2026

The user subsequently reported successful local key inspection and saved the exported JSON on the laptop. The packet was found at the generic app-export filename in Downloads; its actual content identifies slot B. Its domain/schema, P-256 public key, SHA-256 SPKI fingerprint, 32-byte local challenge and five-certificate chain were checked. The leaf public key matches the credential, all certificate issuer/signature links verify, and all issuer certificates report CA status.

Official public root and revocation data were fetched from the exact endpoints linked by Android's attestation documentation, without transmitting this phone's certificates, serials or private material. The chain's root public key matches a published Google root, its self-signature verifies, all five certificates are within validity at the process clock, and no certificate serial appears in the fetched revocation/suspension entries. The status response date was 15 October 2026. These are point-in-time preflight checks, not permanent revocation clearance.

An exact copy of the public evidence, downloaded public trust data and a `PARTIAL_NOT_ENROLLED` report are retained under ignored `.local-release/founder-phone-evidence-review-*`. The original Downloads file was left untouched. No actual public credential/certificate/serial is committed to Git. No root pin, policy, provider setting or enrollment was changed.

Full PKIX constraints and Android attestation-extension policy (hardware authorizations, boot state, application signer binding and patch policy), independently issued fresh challenge, real key possession/signature acceptance, Windows A attestation and independent review remain unfinished. A self-generated challenge matching a public file is not a verifier-issued enrollment challenge. Recovery C and separate governance/checkpoint infrastructure are still absent. Do not describe these preflight results as completed founder enrollment or activate Founder Authority.

Reference: [Android key attestation validation](https://developer.android.com/privacy-and-security/security-key-attestation).

### Off-device static Android attestation policy — 15 October 2026

The separate [attestation tool](attestation/README.md) now compiles the Android-recommended verifier at pinned commit `621149c4ebaeeea844d6f43098687c73c4d370a3`. Its dependency/compiler hashes are locked separately from customer dependencies. The adapter requires strict expected app and publisher identity, generated hardware key, certificate/security-level consistency, P-256 signing-only/SHA-256 authorizations, hardware authentication with no cached authentication window, and locked VERIFIED boot. It fetches only the fixed official Google public roots/revocation endpoints, with bounded data and cache freshness checks. It does not transmit the phone certificate chain, serials or private data to a remote verifier.

Actual phone B evidence passed `STATIC_EVIDENCE_PASSED`: TRUSTED_ENVIRONMENT, VERIFIED boot, device locked, matching package/signer and hardware authorizations. It reports OS patch `2026-08`, vendor and boot patch `2026-06`. A local report and fresh trust data are retained under ignored `.local-release/founder-attestation-review-*`. The reviewed original challenge was locally generated and the app minimum was the original-preview baseline, not an independently approved production freshness/version policy.

Ten local off-device checks passed: positive evidence and rejection of substituted signer/package/challenge/key, future version minimum, revoked leaf, absent anchors, truncated chain and changed signature. Compilation/lint pass. These checks are explicit local public-evidence acceptance, not new tests in the customer regression count and not a replacement for upstream regression or dependency/security review.

This advances the earlier chain-only preflight, but does not finish enrollment. Fresh signing/possession, current/reviewed patch policy, trusted release distribution, Windows A TPM validation, independently issued challenge/ceremony and physical independence of C are still required. The tool emits `enrollment_allowed: false` on every path and cannot change founder policy, pins or providers. Founder Authority remains inactive.

- Separate Windows Hello desktop console, RSA/SHA-256 verification, exact action/target inspection, policy/checkpoint import, audit verification and public signature export. Key creation requires an explicit local button and Windows Hello; it never replaces an existing key. Signing blocks if the OS cannot provide TPM attestation evidence. Certificate-chain/TPM-blob validation is still an independent enrollment requirement, not established by the OS success status.
- Separate Android companion for slot B, minimum Android 12/API 31. No Internet permission, advertising, analytics or Google Play Services dependency. Android Keystore creates a P-256 key with per-operation biometric/PIN authorization and attestation evidence. Software security level, exportable private material and lack of hardware-enforced authentication block signing. Per-use duration accepts the legacy `-1` and verified Android 15 Keystore2 `0` representations; positive authentication windows remain rejected. Timeout `0` is used when requesting this policy. No software key fallback.
- Both native clients verify the same canonical public protocol as Node, inspect full target artifacts, verify state/audit hashes against independently retained checkpoints, and distinguish root-action signatures from audit-checkpoint signatures. Windows uses slot A and Android uses slot B. A separate C adapter must be selected/verified after its actual recovery device is chosen; neither app creates a second slot on the same device.
- Two-device signed checkpoint assembly and public audit inspection. Same-signer quorum, substituted state, different checkpoint heads, cross-purpose signatures and rollback are rejected. Files are exported locally; no external storage/scheduling is configured.
- Execution authorization verifier checks live anchored state, both proposal and confirmation quorums, actual audit receipts, exact target, expiry, cooling evidence, reservation version and freeze. It supplies a stable provider idempotency key. It does not perform a provider action, consume a remote receipt or guarantee an atomic transaction across PostgreSQL and another provider.
- A read-only CI security workflow and CODEOWNERS coverage. These are local configuration files; no GitHub ruleset has been activated and no hosted workflow run has been accepted yet. CI does not deploy or receive production credentials.
- Public infrastructure registry with known project references. Ownership, recovery, MFA and independent enforcement remain explicitly unverified. No private credentials are stored in it.
- Root archive and restore library/CLI verifies two-founder signed advancing snapshots, independent digest/predecessor pins, immutable publication and storage read-back. The local adapter is an export/acceptance tool, not separate cloud storage or scheduled backups. It excludes customer ciphertext and the execution journal.
- Offline one-device replacement planner verifies existing cooled root authorization, independently verified physical-device bindings/evidence and new-key possession. It emits a REVIEW_REQUIRED candidate without mutating enrollment, policy or pins. Native Windows A and Android B now sign domain-separated replacement-possession packets against independently anchored final authorization and matching local hardware keys. Java/.NET/Node byte interoperability and evidence/slot/expiry rejection checks pass; both native builds pass. Real evidence validation, recovery C and provider rotation remain unfinished. See [ARCHIVE-AND-RECOVERY.md](ARCHIVE-AND-RECOVERY.md).

## What you must do manually now

| Task | Required action | Why it cannot be completed by this coding session |
| --- | --- | --- |
| Laptop local authentication | Confirm Windows Hello PIN/biometric is enabled on the HP Victus 15. Later approve the local key-creation and signature prompts yourself. | The founder must authorize their own OS credential; knowing the laptop model is not proof of TPM-backed signing. |
| Phone readiness | Confirm the Vivo Y19s Android version and secure screen lock. Later approve local biometric/PIN signing yourself. | Actual hardware security and authentication are only established by device evidence and a physical acceptance test. |
| Recovery device C | Provide a genuinely separate device/credential and keep it physically separate. | You currently have only the HP laptop and Vivo phone. Two keys on one device are not independent recovery. |
| Infrastructure identities | Confirm primary and backup owners, recovery contacts and authentication methods for GitHub, Vercel, Supabase, company email, billing and release signing. | These are ownership decisions; the registry intentionally does not invent them from an account or project name. |
| Independent storage | Provide a separate governance datastore and independently controlled checkpoint/backup destination. Share only provider/resource names; configure credentials privately. | None is available. Primary database history alone cannot prove that its owner has not rewritten it. |
| Independent review | Arrange a qualified cryptographic/security reviewer and another qualified code reviewer. | Self-review and automated tests do not constitute independent review. A sole code owner cannot independently approve their own PR. |

Do not send PINs, passwords, founder private material or recovery packages in chat. Do not clear the TPM, reset/uninstall enrolled signer apps or erase devices as a troubleshooting step; key loss requires the remaining two credentials and the reviewed rotation procedure.

## Work still requiring engineering and integration

These are **not** manual checkboxes and are not complete:

1. Trusted production native release signing/packaging, attestation-chain and TPM/Android attestation validation, reviewed enrollment, and the C device adapter. The founder has created local Windows credential A and public evidence was structurally checked; no actual founder credential has been enrolled. A separate local-preview software publisher now signs a verified installable preview APK, but it is not an independently trusted production release identity. No founder private key or publisher secret was uploaded.
2. Separate authenticated online admin console and its live identity/role adapters. The gateway has a signed-access-token adapter and bounded same-origin HTTPS transport/server assembly, with mandatory live revocation and independently assigned roles. The separate labelled admin view/client now imports independently pinned state, verifies browser signatures, exports public requests and requires a new two-founder signed checkpoint after mutations. It clears on background and never signs, grants roles or executes provider operations. This does not finish the actual provider login, ACR mapping, identity/role/revocation adapters, secure hosting or `admin.leqvor.com` configuration. No listener was started. See [control/README.md](control/README.md). The customer passkey origin remains `leqvor.vercel.app`.
3. Protected provider integrations. The local one-use execution journal/coordinator now prevents duplicate dispatch, records ambiguous outcomes, rechecks live authorization and performs receipt-only reconciliation. Its tests use simulated providers with a real isolated PostgreSQL journal. Actual ownership transfer, root identity/policy rotation, deployment authorization, provider-enforced freeze, root-secret rotation and external execution-history checkpoints still need independently protected adapters. A Vercel/Supabase/GitHub owner can otherwise change enforcement code or settings. See [EXECUTION-INTEGRATION.md](EXECUTION-INTEGRATION.md).
4. External checkpoint retention/scheduling and cloud restore acceptance. Local verified retention/restore is implemented; a real separate provider, scheduler and cloud test are not. Policy-rotation continuity and independently signed execution-history checkpoints need further engineering. Never treat a head read from the same database as an independent anchor.
5. Reviewed one-device-loss rotation and catastrophic recovery ceremony. The non-mutating replacement planner and A/B native possession-proof signing are implemented; independently trusted attestation/registry, recovery C and atomic provider/policy rotation are still needed. A single recovery phrase, admin role or database credential must not bypass the root quorum. No public bootstrap, force-reset or catastrophic-recovery endpoint has been added.

Activation/deployment waits for these integrations, all three verified devices, real quorum/freeze/rotation acceptance and independent review. The customer app continues operating separately.

## Provider controls to configure during activation

- GitHub: require PRs, independent approvals, code-owner review, dismissal of stale approvals and the `security` status; prohibit force pushes and branch deletion. Protect changes to these controls themselves. The supplied workflow uses commit-pinned GitHub actions and read-only permissions; it is not a root authorization or a signed production build.
- Vercel: integrate protected deployment/promotion authorization. The supplied CI workflow does not by itself stop automatic production deployment or the project owner changing settings. Do not activate Founder Lock until the actual bypass paths have been tested.
- Supabase/governance hosting: use the separately protected store and executor identity. Do not apply `governance/migrations/001_founder_state.sql` to customer production as a shortcut. A database owner can disable its own append-only trigger.
- Native distribution: use a trusted release publisher, reviewed artifacts and verified hashes. A native application distribution signing identity is separate from founder root keys; neither publisher credentials nor founder keys belong in browser environment variables.

Local preview preparation, separate from production distribution:

```powershell
& governance/native/android/build.ps1
& governance/native/android/prepare-preview.ps1 -CreatePreviewPublisher
# Subsequent preview rebuilds reuse the existing protected publisher:
& governance/native/android/prepare-preview.ps1
```

Do not share the publisher directory, password file or keystore with the phone. Only the signed preview APK is intended for transfer. Package signature verification proves package integrity under this local publisher, not hardware-backed founder enrollment or independent review. Signing reference: [Android apksigner](https://developer.android.com/tools/apksigner).

## Build and acceptance commands

From `C:\Users\VICTUS\continuum`:

```powershell
& governance/native/android/build.ps1
node governance/check-native.mjs
& .local-release/founder-tools/dotnet/dotnet.exe build governance/native/windows/FounderConsole.csproj --configuration Release -p:RestoreLockedMode=true
& .local-release/founder-tools/dotnet/dotnet.exe .local-release/founder-windows/bin/net10.0-windows10.0.19041.0/FounderConsole.dll --check-protocol .local-release/founder-native-acceptance/public-vectors.json
```

Build scripts use Android SDK platform/build tools 36, the existing Android Studio Java runtime, pinned .NET SDK 10.0.401 and a locked restore. `check-native.mjs` uses the cached pinned org.json 20250517 JVM test runtime. Public synthetic fixtures and binaries stay under ignored `.local-release`; disposable software test keys are generated only in memory. Subsequently, the local Windows application was opened for the founder's private A key-creation ceremony described above. No Android application was installed; no real root action/checkpoint/possession approval was signed or enrolled.

Native import formats:

```text
Independent authority file: { policy, checkpoint, state }
Separate action file:       { request, target }
Root approval export:      { slot, key_id, signature }
Checkpoint export:         { checkpoint, approval: { slot, key_id, signature } }
Replacement import:        { request, target, evidence }
Possession export:         { slot, key_id, signature }
```

Import the authority file from independently verified/retained records, not from an untrusted request sender. The `target` is the complete public action artifact whose canonical digest is committed by `request.target`. Imported metadata cannot prove its own provenance. Both clients display the policy pin, key pin, version, phase and expiry; compare them independently before approval. The native import size is capped at 64 KiB; larger audit histories need reviewed archival/checkpoint support rather than silently skipping verification.

```powershell
node governance/audit-inspect.mjs independent-policy.json public-snapshot.json independent-checkpoint.json
node governance/checkpoint-assemble.mjs independent-policy.json device-A-checkpoint.json device-B-checkpoint.json new-signed-checkpoint.json
```

The assembler verifies two distinct founder signatures and refuses to overwrite an existing file. It does not enroll identities or upload backups. Another independently held checkpoint is required to detect rollback/forks; valid old signatures alone do not prove freshness.

Primary references: [Windows Hello](https://learn.microsoft.com/en-us/windows/apps/develop/security/windows-hello), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Android KeyInfo per-use authentication](https://developer.android.com/reference/android/security/keystore/KeyInfo), [Microsoft .NET 10 downloads](https://dotnet.microsoft.com/en-us/download/dotnet/10.0), [GitHub checkout release](https://github.com/actions/checkout/releases/tag/v7.0.1), [GitHub setup-node release](https://github.com/actions/setup-node/releases/tag/v7.1.0). These document API/build behavior, not acceptance of your physical devices or production governance.
