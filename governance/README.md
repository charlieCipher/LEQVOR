# LEQVOR founder governance implementation

15 October: both actual A/B isolated signing tests passed off-device verification against their retained public keys and exact issued requests before expiry. See [DEVICE-KEY-TEST.md](DEVICE-KEY-TEST.md) and [MANUAL-ACTIVATION.md](MANUAL-ACTIVATION.md) for evidence and limits. This does not establish independent Windows TPM validation or enrollment. The user has no third device; activation remains blocked and the 2-of-3 requirement is unchanged.

This is a separate, locally tested subsystem. It is not enrolled, connected to customer production, or an active Founder Lock. Do not apply its migration to the customer Supabase project or expose it through the customer Vercel API.

## Implemented

| Component | Current behavior |
| --- | --- |
| Canonical mesh protocol | Domain/platform/policy/version-bound requests; exact target-artifact digest; nonce, expiry, request ID and proposal binding; RSA/SHA-256 and P-256/SHA-256 public verification |
| Root policy | Exactly A/B/C with distinct public keys, quorum 2, 72-hour cooling; no one-key root threshold |
| Queue and approval engine | Persists proposal, distinct verified signatures, cooling, fresh confirmation, consumed proposals and AUTHORIZED state; no ownership-transfer success claim |
| Freeze / unfreeze | One-key logical freeze invalidates existing version; cooled two-key unfreeze; does not pretend to freeze GitHub/Vercel/provider controls |
| Protective cancellation | Fresh action-bound cancellation signature, one founder veto, cancellation invalidates later confirmation |
| Audit | Hash-linked public events, signed approval packets, retained checkpoint verification including a digest of policy, version, freeze and complete request state; SQL append-only audit mirror; state/audit consistency checks |
| Transaction store | PostgreSQL row locking, atomic state/audit writes, rollback and concurrent-checkpoint conflict rejection |
| Admin gateway boundary | Separate control-session audience, explicit role provider, fresh MFA for mutations; no customer-session, caller-role or execute/bootstrap override |
| Control-service transport | Separate pinned-dependency package: signed access-token/JWKS verification, mandatory live revocation/role adapters, bounded same-origin HTTPS handler and explicit TLS server assembly; no listener, provider configuration or online login UI |
| Separate admin workflow | Labelled DOM view and injected client; independently pinned snapshot/audit verification, exact public target export, local public signature verification, two-founder signed checkpoint advancement and background clearing; actual login/hosting entry remains unconfigured |
| Offline console | Local file inspector, verifies separately held public policy and exact target artifact, displays consequences and exact approval bytes; no listener or private-key fallback |
| Native clients | Compiled Windows Hello console A and offline Android Keystore companion B; hardware/authentication checks, full action/target display, independently imported policy/checkpoint/state; no actual device enrollment or release signing |
| Signed checkpoints | Native checkpoint signing path, two-device public signature assembly, snapshot/audit verification and rollback checks; no external upload or schedule |
| Execution verification | Re-verifies live anchored state, two phases, quorums, cooling receipts, expiry and exact target; produces an idempotency identifier, performs no provider operation |
| Execution journal/coordinator | Atomic one-use PostgreSQL reservations, immutable hash-linked outcomes, live recheck, bounded provider calls, no automatic ambiguous retry and receipt-only reconciliation; no real provider adapters or execution-history checkpoints |
| Root archive / public restore | Two-founder signed advancing snapshots, independent predecessor/digest verification, immutable publication and read-back verification; local adapter/CLI only, no cloud scheduling or customer backup claim |
| Device-loss replacement plan | Existing root authorization, independent three-device registry/evidence contract and new-key possession verification; non-mutating REVIEW_REQUIRED candidate, no enrollment/reset shortcut |
| Native replacement proof | Windows A / Android B locally sign possession-only commitments after verifying the anchored final authorization, full replacement target/evidence and new local hardware-key pin; no enrollment or rotation execution |
| Off-device Android evidence | Pinned official Kotlin verifier, strict app/publisher and hardware/boot constraints, fresh public trust inputs, bounded offline certificate handling and ten local acceptance checks; static review only, never enrollment |
| Release review | Read-only CI workflow, sensitive-path code owners and unverified public infrastructure registry; hosted protection/independent enforcement still pending |

Requests store the target artifact's canonical SHA-256 digest. Transfer the complete target artifact to both local consoles and inspect it; each console checks that it matches this commitment. Never approve an unexplained digest. Private keys are not accepted by any gateway or protocol packet.

`initialGovernance` is a provisioning primitive for isolated tests and a future reviewed enrollment ceremony. It is not enrollment verification. No production bootstrap caller, role assignment or signing identity is provided. The engine requires an independent `policyPin` provider at construction; reading that pin from the same mutable database would defeat its boundary. Caller checkpoints must come from independently retained, verified history, not automatically from the response being validated. Native checkpoint signing and local quorum assembly are implemented; external distribution/retention is still unconfigured.

`AUTHORIZED` reserves one root action and advances the governance version; it does not perform a provider transfer, key replacement, policy deletion or deployment. Those actions need independently protected executors with reconciliation and a verified execution receipt. There is deliberately no executable provider adapter or root mutation shortcut. A logical freeze flag cannot stop a Vercel/Supabase owner from changing code. Protect the executor and infrastructure authority separately before activation.

## Local validation

Run `npx vitest run tests/founder-mesh.test.js tests/founder-gateway.test.js tests/founder-protocol.test.js`, then `npm run lint -- --max-warnings=0`.

Mesh tests use a real isolated PostgreSQL engine (PGlite), with disposable software test keys. They cover 2-of-3, same-key duplication, 72-hour cooling, fresh confirmation signatures, tampered target, replay, expiry, freeze, cancellation, concurrent writes, transactional rollback, append-only SQL, duplicate policy identities, policy-pin substitution, fabricated stored signatures and audit corruption. They do not establish hardware-backed signing or resistance to the PostgreSQL/provider owner.

On 12 October 2026, all 16 targeted governance tests and the full 336-test regression suite (80 files) passed. Lint and build-artifact checks passed; the customer production bundle retained its existing asset hashes. A synthetic public-file console smoke check displayed the complete committed action and target, then explicitly refused signing without a hardware adapter. No private keys were written to disk or enrolled. Database-only changes to cooling, freeze and request status were rejected against the independently retained state checkpoint. These checks validate the local core, not production activation.

The subsequent native/audit increment passed 20 focused governance tests and the final full 340-test suite (81 files), lint, PostgreSQL isolation checks, encrypted restore, production build and artifact checks. An earlier full run timed out in an existing Argon2 compatibility test; its targeted rerun and final full suite passed without modifying encryption or increasing the timeout. Java and .NET public-protocol interoperability passed, including non-empty audit/state verification and action/checkpoint signing bytes. The Windows project built with zero warnings/errors; Android compiled an unsigned APK without Internet permission. Customer asset hashes remained `index-CfvBoNr3.js` and `index-58SJVvnB.css`. These are local acceptance results; physical credentials, hosted CI/enforcement and independent review remain pending.

Offline inspection:

`node governance/founder-console.mjs <independent-policy.json> <request.json> <target-artifact.json> <current-version> <A|B|C>`

The Node inspector does not sign. Separate native clients now compile and expose OS-authenticated signing paths, but have not been physically tested/enrolled or published as signed releases. They must not receive a .pem/private JWK/software-key fallback. The prior `scripts/founder-inspect.mjs` is the superseded single-key experiment and is not the mesh console. [MANUAL-ACTIVATION.md](MANUAL-ACTIVATION.md) distinguishes manual requirements from unfinished engineering/integration.

## Remaining activation dependencies

The archive/replacement increment adds verified public-file retention/restore and an offline one-device replacement planner. The full regression passed **366 tests across 87 files**, and the separate control-service passed six acceptance tests. Subsequent focused checks cover the real archive CLI, no-overwrite restore and bounded regular-file imports. Lint and customer build/artifact checks pass; customer asset hashes remain unchanged. See [ARCHIVE-AND-RECOVERY.md](ARCHIVE-AND-RECOVERY.md) for limits and remaining native/evidence/provider integration. No production permissions, configuration or deployment have been changed.

The next increment adds bounded transport-peer admission, a one-connection PostgreSQL pool adapter and the protected execution journal/coordinator. Eight new local tests pass; provider adapters are simulated and no live controls are configured. The full regression suite now passes **360 tests across 85 files**, with six separate control-service acceptance tests also passing; lint and customer build/artifact checks pass. Customer asset hashes remain unchanged. See [EXECUTION-INTEGRATION.md](EXECUTION-INTEGRATION.md) for the remaining independent-fence, provider receipt and execution-checkpoint requirements.

The control-service increment adds six passing acceptance tests for actual signed access tokens and HTTP rejection/logging boundaries; the existing 20 focused governance tests and lint also pass. See [control/README.md](control/README.md) for the exact identity/transport contract and remaining live configuration. No admin identity, listener, hosting change or founder activation was created.

On 13 October 2026 the separate admin workflow increment passed 12 browser client/view tests plus the existing 20 governance tests and six control-boundary acceptance tests (38 targeted checks). These cover mixed RSA/P-256 signatures, independent snapshot verification, checkpoint quorum/domain substitution, no automatic mutation retry, safe public rendering, file/background clearing and cooled confirmation binding. An initial existing PostgreSQL test timed out; its subsequent focused run passed without changing its timeout. Lint, Java/.NET protocol interoperability and customer build/artifact checks passed. Customer JS/CSS hashes remain unchanged. The full regression suite was not rerun for this governance-only increment; the previous full result remains 340 tests. Actual online login/hosting, hardware enrollment and production enforcement remain unverified.

1. Physically verify the compiled Windows Hello console on the HP Victus 15, including independent TPM attestation validation and display-to-signature binding. Windows Hello may use software protection when TPM is unavailable; the client blocks signing without successful attestation evidence. Pinned Microsoft SDK 10.0.401 was checksum-verified and extracted into the ignored local tools folder; the project compiled with zero warnings/errors. No app was installed/launched or real key created.
2. Physically verify the compiled Android Keystore companion on the Vivo Y19s, including Android version, hardware attestation and display-to-signature binding. The existing Android SDK and Java runtime compiled an unsigned APK. Public protocol interoperability tests passed. Never infer non-exportability/security level from its model alone; no phone application was installed or key enrolled.
3. Provide a separate recovery device C. The user currently has only one laptop and one phone. No software/disk/cloud replacement credential has been generated and no quorum has been lowered.
4. Implement reviewed enrollment/rotation and catastrophic recovery. No PIN/biometric/credential ceremony has been performed by this coding session.
5. Provision the separate protected datastore, independent root pin and external checkpoint destination, and server authentication/role adapters. The customer database does not supply this authority.
6. Implement the separate administrative console and protected execution integrations; configure actual domains if owned, branch/deployment policies, build provenance and infrastructure ownership controls. The customer permanent origin stays leqvor.vercel.app.
7. Complete device/interoperability, malicious-admin and infrastructure bypass acceptance and independent security review before activation. No 9.x security rating has been validated.

Primary adapter references: [Windows Hello](https://learn.microsoft.com/en-us/windows/apps/develop/security/windows-hello), [Android Keystore](https://developer.android.com/privacy-and-security/keystore). These guide native implementation; they are not proof that either user's device has been enrolled or verified.
