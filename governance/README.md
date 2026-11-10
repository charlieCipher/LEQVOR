# LEQVOR founder governance implementation

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
| Offline console | Local file inspector, verifies separately held public policy and exact target artifact, displays consequences and exact approval bytes; no listener or private-key fallback |

Requests store the target artifact's canonical SHA-256 digest. Transfer the complete target artifact to both local consoles and inspect it; each console checks that it matches this commitment. Never approve an unexplained digest. Private keys are not accepted by any gateway or protocol packet.

`initialGovernance` is a provisioning primitive for isolated tests and a future reviewed enrollment ceremony. It is not enrollment verification. No production bootstrap caller, role assignment or signing identity is provided. The engine requires an independent `policyPin` provider at construction; reading that pin from the same mutable database would defeat its boundary. Caller checkpoints must come from independently retained, verified history, not automatically from the response being validated. Signed external checkpoint distribution/retention is still unimplemented.

`AUTHORIZED` reserves one root action and advances the governance version; it does not perform a provider transfer, key replacement, policy deletion or deployment. Those actions need independently protected executors with reconciliation and a verified execution receipt. There is deliberately no executable provider adapter or root mutation shortcut. A logical freeze flag cannot stop a Vercel/Supabase owner from changing code. Protect the executor and infrastructure authority separately before activation.

## Local validation

Run `npx vitest run tests/founder-mesh.test.js tests/founder-gateway.test.js tests/founder-protocol.test.js`, then `npm run lint -- --max-warnings=0`.

Mesh tests use a real isolated PostgreSQL engine (PGlite), with disposable software test keys. They cover 2-of-3, same-key duplication, 72-hour cooling, fresh confirmation signatures, tampered target, replay, expiry, freeze, cancellation, concurrent writes, transactional rollback, append-only SQL, duplicate policy identities, policy-pin substitution, fabricated stored signatures and audit corruption. They do not establish hardware-backed signing or resistance to the PostgreSQL/provider owner.

On 12 October 2026, all 16 targeted governance tests and the full 336-test regression suite (80 files) passed. Lint and build-artifact checks passed; the customer production bundle retained its existing asset hashes. A synthetic public-file console smoke check displayed the complete committed action and target, then explicitly refused signing without a hardware adapter. No private keys were written to disk or enrolled. Database-only changes to cooling, freeze and request status were rejected against the independently retained state checkpoint. These checks validate the local core, not production activation.

Offline inspection:

`node governance/founder-console.mjs <independent-policy.json> <request.json> <target-artifact.json> <current-version> <A|B|C>`

The console does not sign; absence of a verified local adapter is an explicit blocker. It must not receive a .pem/private JWK/software-key fallback. The prior `scripts/founder-inspect.mjs` is the superseded single-key experiment and is not the mesh console.

## Remaining activation dependencies

1. Build/verify Windows Hello signing on the HP Victus 15; verify actual TPM backing, not just the laptop model. Windows Hello may use software protection when TPM is unavailable. Its RSA signature format must match the reviewed adapter. This computer currently has no detected .NET SDK; no native project has been compiled or installed.
2. Build/verify the Android Keystore companion on the Vivo Y19s, including Android version, supported authentication, hardware key properties and actual display-to-signature binding. No Android build toolchain/SDK has been verified here. Never infer non-exportability/security level from its model alone.
3. Provide a separate recovery device C. The user currently has only one laptop and one phone. No software/disk/cloud replacement credential has been generated and no quorum has been lowered.
4. Implement reviewed enrollment/rotation and catastrophic recovery. No PIN/biometric/credential ceremony has been performed by this coding session.
5. Provision the separate protected datastore, independent root pin and external checkpoint destination, and server authentication/role adapters. The customer database does not supply this authority.
6. Implement the separate administrative console and protected execution integrations; configure actual domains if owned, branch/deployment policies, build provenance and infrastructure ownership controls. The customer permanent origin stays leqvor.vercel.app.
7. Complete device/interoperability, malicious-admin and infrastructure bypass acceptance and independent security review before activation. No 9.x security rating has been validated.

Primary adapter references: [Windows Hello](https://learn.microsoft.com/en-us/windows/apps/develop/security/windows-hello), [Android Keystore](https://developer.android.com/privacy-and-security/keystore). These guide native implementation; they are not proof that either user's device has been enrolled or verified.
