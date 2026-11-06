# LEQVOR master architecture — 13 September 2026

LEQVOR by LENVOR · Assets | Records | Forever

This supersedes the earlier Aureva product specification where they differ. Preserve the approved UI while implementing the following architecture. The implementation ledger reports actual capabilities; this document describes the target, not a production-readiness claim.

## Trust model

Only the active trusted client receives plaintext. API, PostgreSQL, object storage, email, billing, logs and backup infrastructure receive ciphertext and minimum operational metadata. No AI processing of vault data. Authentication is separate from possession of vault keys.

## Boundaries

- `leqvor.com`: marketing and pricing.
- `app.leqvor.com`: secure client; no trackers or marketing scripts, strict CSP, conservative dependencies.
- `api.leqvor.com`: identity, opaque vault metadata, sharing, approvals, security events, notifications and entitlements.
- `status.leqvor.com` and `docs.leqvor.com`: operational status and documentation.
- Provider adapters isolate authentication, database, storage, jobs, email and billing. Supabase remains replaceable infrastructure.

## Security and data systems

Client-generated 256-bit VMK; independent random record/file DEKs; AES-256-GCM authenticated ciphertext; Argon2id for passwords and HKDF for appropriate random-secret derivation. Encrypt titles, classifications, instructions, filenames and sensitive metadata. Separate recovery and device wrappers; never share the VMK.

Vault owns records, documents, versions, assignments and access rules. Categories include personal, financial, property, insurance, legal, medical and other. People hold independently verified identity, relationship, recipient keys, assignments, permissions, conditions and revocation state. Insurance remains structured continuity information, not advisory or claim processing.

Secure Reveal is deliberate and policy-gated. Cold Lock clears active decrypted state, key references and object URLs on timeout/background/lock; it does not claim forensic memory erasure. Sensitive operations require fresh authentication. Recovery uses a random 24-word secret; practice, fresh-device recovery and restore drills are required.

Sharing wraps individual record DEKs for verified recipients. Revocation controls future retrieval/new ciphertext, not previously copied plaintext. Shield approvals are signed, action-bound, expiring and single-use. Signed chained security history requires independent checkpoints; call it tamper-evident only when end-to-end implemented.

Emergency lockdown revokes sessions/device tokens/pending shares and forces strong reauthentication without deleting ciphertext. Optional opaque decoy vault slots and PIN scrambling follow professional review of the normal vault.

Continuity connects meaningful coverage, people, contacts, instructions, encrypted statements, legal references and periodic reviews. Readiness is factual and explainable. Billing receives only customer/subscription metadata; encryption, basic recovery and authentication protections remain universal.

## Delivery gates

| Phase | Required outcome |
|---|---|
| P0 | Auth, client encryption, vault CRUD/files, service authorization + RLS + storage isolation, deliberate reveal |
| P1 | Recovery, Cold Lock, devices, ciphertext backups, timeline, independent restore tests |
| P2 | Verified people/keys, cryptographic sharing, revocation, continuity |
| P3 | Shield, durable signed history, advanced access policies |
| P4 | Reviewed optional duress, PIN scrambling, advanced emergency controls |
| P5 | Independent audit, penetration test, compliance and production hardening |

## One-week execution order

1. P0 boundary audit and adversarial automated tests; prepare staging migration and two-account checks.
2. Run staging auth/CRUD/object-store isolation scenarios; repair failures before expanding access.
3. Recovery/backup restore exercises and lifecycle cleanup.
4. Verified recipient and grant transaction foundation.
5. Sharing/revocation scenarios and continuity integration.
6. Regression, fresh-device drills, deployment-origin/header checks and operational documentation.
7. Acceptance review and explicit release decision against evidence.

This is a work sequence, not a promise that external review or all P0–P5 capabilities fit one week. Unverified features must remain unavailable. Independent audit, domain setup, provider credentials and external testing depend on actual availability.

## Current blockers

Docker engine is unavailable locally, so staging/database RLS execution remains unverified. No migration or production release is implied by passing unit tests. Track concrete results in `V5-IMPLEMENTATION.md`.
