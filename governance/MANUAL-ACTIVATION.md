# LEQVOR founder authority: manual work and remaining integration

13 October 2026. Founder authority remains **inactive**. The customer website, account/vault passwords and current customer origin are unchanged. Native builds are local acceptance artifacts, not signed production releases.

Validation: latest full suite **366 tests across 87 files passed**, plus six separate control-service acceptance tests. The archive CLI and bounded-file refinements also passed a subsequent focused run. Lint and customer production build/artifact checks pass; earlier PostgreSQL isolation, encrypted restore and Java/.NET interoperability checks passed. Windows compilation had zero warnings/errors. Execution-journal tests use a real isolated PostgreSQL engine with simulated provider adapters. These results do not replace physical-device acceptance, independent attestation validation, live provider controls or infrastructure-owner bypass testing.

## Work completed in code

- Separate Windows Hello desktop console, RSA/SHA-256 verification, exact action/target inspection, policy/checkpoint import, audit verification and public signature export. Key creation requires an explicit local button and Windows Hello; it never replaces an existing key. Signing blocks if the OS cannot provide TPM attestation evidence. Certificate-chain/TPM-blob validation is still an independent enrollment requirement, not established by the OS success status.
- Separate Android companion for slot B, minimum Android 12/API 31. No Internet permission, advertising, analytics or Google Play Services dependency. Android Keystore creates a P-256 key with per-operation biometric/PIN authorization and attestation evidence. Software security level, exportable private material and lack of hardware-enforced authentication block signing. The documented KeyInfo per-use duration is `-1`; timeout `0` is used when requesting this policy. No software key fallback.
- Both native clients verify the same canonical public protocol as Node, inspect full target artifacts, verify state/audit hashes against independently retained checkpoints, and distinguish root-action signatures from audit-checkpoint signatures. Windows uses slot A and Android uses slot B. A separate C adapter must be selected/verified after its actual recovery device is chosen; neither app creates a second slot on the same device.
- Two-device signed checkpoint assembly and public audit inspection. Same-signer quorum, substituted state, different checkpoint heads, cross-purpose signatures and rollback are rejected. Files are exported locally; no external storage/scheduling is configured.
- Execution authorization verifier checks live anchored state, both proposal and confirmation quorums, actual audit receipts, exact target, expiry, cooling evidence, reservation version and freeze. It supplies a stable provider idempotency key. It does not perform a provider action, consume a remote receipt or guarantee an atomic transaction across PostgreSQL and another provider.
- A read-only CI security workflow and CODEOWNERS coverage. These are local configuration files; no GitHub ruleset has been activated and no hosted workflow run has been accepted yet. CI does not deploy or receive production credentials.
- Public infrastructure registry with known project references. Ownership, recovery, MFA and independent enforcement remain explicitly unverified. No private credentials are stored in it.
- Root archive and restore library/CLI verifies two-founder signed advancing snapshots, independent digest/predecessor pins, immutable publication and storage read-back. The local adapter is an export/acceptance tool, not separate cloud storage or scheduled backups. It excludes customer ciphertext and the execution journal.
- Offline one-device replacement planner verifies existing cooled root authorization, independently verified physical-device bindings/evidence and new-key possession. It emits a REVIEW_REQUIRED candidate without mutating enrollment, policy or pins. Native replacement-possession signing, real evidence validation and provider rotation remain unfinished. See [ARCHIVE-AND-RECOVERY.md](ARCHIVE-AND-RECOVERY.md).

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

1. Trusted native release signing/packaging, attestation-chain and TPM/Android attestation validation, reviewed enrollment, and the C device adapter. No actual founder key has been created/enrolled in this session. The unsigned Android APK is not an installable production release; no distribution signing key was invented or uploaded.
2. Separate authenticated online admin console and its live identity/role adapters. The gateway has a signed-access-token adapter and bounded same-origin HTTPS transport/server assembly, with mandatory live revocation and independently assigned roles. The separate labelled admin view/client now imports independently pinned state, verifies browser signatures, exports public requests and requires a new two-founder signed checkpoint after mutations. It clears on background and never signs, grants roles or executes provider operations. This does not finish the actual provider login, ACR mapping, identity/role/revocation adapters, secure hosting or `admin.leqvor.com` configuration. No listener was started. See [control/README.md](control/README.md). The customer passkey origin remains `leqvor.vercel.app`.
3. Protected provider integrations. The local one-use execution journal/coordinator now prevents duplicate dispatch, records ambiguous outcomes, rechecks live authorization and performs receipt-only reconciliation. Its tests use simulated providers with a real isolated PostgreSQL journal. Actual ownership transfer, root identity/policy rotation, deployment authorization, provider-enforced freeze, root-secret rotation and external execution-history checkpoints still need independently protected adapters. A Vercel/Supabase/GitHub owner can otherwise change enforcement code or settings. See [EXECUTION-INTEGRATION.md](EXECUTION-INTEGRATION.md).
4. External checkpoint retention/scheduling and cloud restore acceptance. Local verified retention/restore is implemented; a real separate provider, scheduler and cloud test are not. Policy-rotation continuity and independently signed execution-history checkpoints need further engineering. Never treat a head read from the same database as an independent anchor.
5. Reviewed one-device-loss rotation and catastrophic recovery ceremony. The non-mutating replacement planner is implemented; native possession-proof signing, independently trusted attestation/registry and atomic provider/policy rotation are still needed. A single recovery phrase, admin role or database credential must not bypass the root quorum. No public bootstrap, force-reset or catastrophic-recovery endpoint has been added.

Activation/deployment waits for these integrations, all three verified devices, real quorum/freeze/rotation acceptance and independent review. The customer app continues operating separately.

## Provider controls to configure during activation

- GitHub: require PRs, independent approvals, code-owner review, dismissal of stale approvals and the `security` status; prohibit force pushes and branch deletion. Protect changes to these controls themselves. The supplied workflow uses commit-pinned GitHub actions and read-only permissions; it is not a root authorization or a signed production build.
- Vercel: integrate protected deployment/promotion authorization. The supplied CI workflow does not by itself stop automatic production deployment or the project owner changing settings. Do not activate Founder Lock until the actual bypass paths have been tested.
- Supabase/governance hosting: use the separately protected store and executor identity. Do not apply `governance/migrations/001_founder_state.sql` to customer production as a shortcut. A database owner can disable its own append-only trigger.
- Native distribution: use a trusted release publisher, reviewed artifacts and verified hashes. A native application distribution signing identity is separate from founder root keys; neither publisher credentials nor founder keys belong in browser environment variables.

## Build and acceptance commands

From `C:\Users\VICTUS\continuum`:

```powershell
& governance/native/android/build.ps1
node governance/check-native.mjs
& .local-release/founder-tools/dotnet/dotnet.exe build governance/native/windows/FounderConsole.csproj --configuration Release -p:RestoreLockedMode=true
& .local-release/founder-tools/dotnet/dotnet.exe .local-release/founder-windows/bin/net10.0-windows10.0.19041.0/FounderConsole.dll --check-protocol .local-release/founder-native-acceptance/public-vectors.json
```

Build scripts use Android SDK platform/build tools 36, the existing Android Studio Java runtime, pinned .NET SDK 10.0.401 and a locked restore. `check-native.mjs` uses the cached pinned org.json 20250517 JVM test runtime. Public synthetic fixtures and binaries stay under ignored `.local-release`; disposable software test keys are generated only in memory. No native application was launched, installed, or used to create/sign a real founder credential.

Native import formats:

```text
Independent authority file: { policy, checkpoint, state }
Separate action file:       { request, target }
Root approval export:      { slot, key_id, signature }
Checkpoint export:         { checkpoint, approval: { slot, key_id, signature } }
```

Import the authority file from independently verified/retained records, not from an untrusted request sender. The `target` is the complete public action artifact whose canonical digest is committed by `request.target`. Imported metadata cannot prove its own provenance. Both clients display the policy pin, key pin, version, phase and expiry; compare them independently before approval. The native import size is capped at 64 KiB; larger audit histories need reviewed archival/checkpoint support rather than silently skipping verification.

```powershell
node governance/audit-inspect.mjs independent-policy.json public-snapshot.json independent-checkpoint.json
node governance/checkpoint-assemble.mjs independent-policy.json device-A-checkpoint.json device-B-checkpoint.json new-signed-checkpoint.json
```

The assembler verifies two distinct founder signatures and refuses to overwrite an existing file. It does not enroll identities or upload backups. Another independently held checkpoint is required to detect rollback/forks; valid old signatures alone do not prove freshness.

Primary references: [Windows Hello](https://learn.microsoft.com/en-us/windows/apps/develop/security/windows-hello), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Android KeyInfo per-use authentication](https://developer.android.com/reference/android/security/keystore/KeyInfo), [Microsoft .NET 10 downloads](https://dotnet.microsoft.com/en-us/download/dotnet/10.0), [GitHub checkout release](https://github.com/actions/checkout/releases/tag/v7.0.1), [GitHub setup-node release](https://github.com/actions/setup-node/releases/tag/v7.1.0). These document API/build behavior, not acceptance of your physical devices or production governance.
