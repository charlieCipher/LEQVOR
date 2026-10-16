# C-Ready Founder Authority enrollment preparation

16 October 2026. Implemented separately from the root-policy engine. This layer stores **planning records**, not enrolled policies, permissions or founder authority. The production validator still requires exactly three distinct A/B/C public credentials, threshold two and 72-hour cooling. No existing key is reset, cloned or replaced.

## Lifecycle

| Stage | Meaning | Authority |
| --- | --- | --- |
| PREPARED | A/B/C slots exist. Evidence can be recorded for any real available device. Missing slots have null credentials and hashes. Recorded evidence remains EVIDENCE_PENDING_ACCEPTANCE. | None; no policy candidate until every slot and independent acceptance are present. |
| ENROLLMENT_READY | All three public credentials, evidence and physical bindings have passed a separately trusted readiness verifier, every infrastructure/security gate, and the independent policy-pin check. | Still none. The returned complete policy is a candidate for a reviewed initialization ceremony, not an enrolled policy. |
| ACTIVE | A later reviewed production initialization ceremony and actual service acceptance have completed. | Governed by the existing three-key engine and independent provider enforcement. No preparation-layer activate command, automatic transition or initialization writer exists. |

`createEnrollmentPreparation`, `recordEnrollmentEvidence` and `assessEnrollmentPreparation` are explicit module APIs. A preparation record always has `status: PREPARED` and `root_authority_active:false`. An assessment may describe ENROLLMENT_READY, but always has `activation_allowed:false` and `root_authority_active:false`. ACTIVE is an architectural lifecycle stage, never a value accepted by the preparation validator. The existing protocol rejects both preparation and assessment records as root policies.

Public evidence is size/shape/public-key checked and hashed, not automatically trusted. The module accepts no private key field or self-asserted independently-verified flag. Same evidence is idempotent; new evidence for the same key advances the planning revision and predecessor hash. Another key cannot replace an already recorded slot through this preparation path. After enrollment, actual changes must use the reviewed root-authorized rotation/replacement path, with a new policy hash and invalidation of stale approvals; this planner does not implement a rotation shortcut. Revision hashes alone do not establish independent trust or protect against a local filesystem owner.

## Public-file workflow

Use fresh output paths; all writes refuse overwrite:

```powershell
node governance/enrollment-preparation-cli.mjs create ABSOLUTE_EMPTY_PREPARATION.json
node governance/enrollment-preparation-cli.mjs record ABSOLUTE_EMPTY_PREPARATION.json ABSOLUTE_A_PUBLIC_EVIDENCE.json ABSOLUTE_A_PREPARATION.json
node governance/enrollment-preparation-cli.mjs record ABSOLUTE_A_PREPARATION.json ABSOLUTE_B_PUBLIC_EVIDENCE.json ABSOLUTE_AB_PREPARATION.json
node governance/enrollment-preparation-cli.mjs inspect ABSOLUTE_AB_PREPARATION.json
```

When C is available, record its **actual separately generated public evidence** into a fresh planning revision. Do not create a second A/B key to stand in for C. Merely recording C does not produce readiness or activation. CLI inspection has no acceptance adapters and cannot assert readiness. Actual device identifiers, evidence and planning files stay outside Git, under an explicitly selected local directory.

## Readiness adapter contract

Assessment requires explicit trusted `verifyReadiness` and `getIndependentPolicyPin` adapters. There are no default/fake acceptance adapters and no route accepting a browser's approval booleans. The verifier receives the cloned preparation/policy and their exact hashes. It must independently authenticate the hardware/enrollment, physical-device registry, infrastructure and qualified-review evidence before returning its bounded receipt. A mocked adapter's boolean flags are **not proof** of any real control. Concrete production acceptance adapters remain unconfigured.

The receipt must bind the exact preparation and complete policy, a verifier report hash, and one matching key/evidence/physical-device binding per slot. Device-instance hashes must be distinct and must originate from the independently verified physical registry; manually choosing different strings does not prove different devices. All twelve gates must be true: hardware attestation, fresh enrollment evidence, revocation, physical independence, independent policy pin, governance hosting, identity/MFA/roles, separate datastore, independent checkpoints, provider enforcement, build provenance and independent review. The policy hash must match a separately controlled pin. Receipts expire within five minutes; substitutions, duplicate bindings, verifier errors, wrong pins, expiry during awaited verification and reversed/invalid clocks deny readiness. The caller must supply a current independently trusted preparation, not accept an uploaded planning file as authority.

This is a fail-closed **assessment interface**, not a cryptographic replacement for those external verifiers, a production enrollment service or a bootstrap permission. No policy pin, database, provider, credential or service state is written. A reviewed initialization ceremony must still bind the final policy and independently accepted receipt to the protected service. Missing resources and reviewer acceptance remain blockers independently of C.

## Current A/B evidence

The retained public A/B packets were recorded into a real local revision on 16 October. Both remain EVIDENCE_PENDING_ACCEPTANCE; C is NOT_PROVISIONED with null credential/evidence. The assessment reports PREPARED, no policy candidate and no authority. Original A/B keys/evidence were not altered. Existing possession tests do not resolve Windows SHA-1 attestation/fresh enrollment requirements or substitute for production hardware acceptance.

## Validation

Seven new tests cover empty C, immutable input and revision binding, rejection by the production validator, no weaker knobs/active flags/self-acceptance, key reuse/replacement, twelve acceptance gates, physical independence, receipt/pin/clock/expiry failures, and the actual public-file CLI/no-overwrite behavior. The existing engine is exercised with disposable software fixtures for **A+B, A+C and B+C**, including early-confirmation rejection and fresh signatures after 72 simulated hours. These are tests of the unchanged policy, not physical founder enrollment or a real elapsed cooling ceremony.

No customer UI, customer encryption/password, production permission, policy pin or deployment changed. Separate hosting/identity/datastore/checkpoints, real provider fences, accepted hardware enrollment and an independent review remain required for production, as recorded in [ACTIVATION-STATUS.md](ACTIVATION-STATUS.md).
