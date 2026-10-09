# Trigger and verification planning

9 October 2026 — local implementation, not applied to production.

`V5VaultService.triggerPlanning` supplies owner-only encrypted policy creation, record-specific draft rules and append-only evidence/review entries. The database provider rejects decrypted fields at its transport boundary. Each item has its own record DEK, wrapped with the owner's VMK; rule/policy/record/evidence references are also bound inside authenticated ciphertext. Retrieval requires an unlocked session and drops results if Cold Lock occurs during the operation.

Policies record selected same-vault people, minimum review count, required evidence descriptions, expiration and instructions. These are owner-authored planning facts, not proof of reviewer identity or qualification. Evidence references point to existing encrypted records; evidence content is never copied into a plaintext table. Evidence currency is `NEEDS_REVIEW` or `EXPIRED`, never approval. Owner review notes can record `RECORDED`, `REJECTED` or `NEEDS_REVIEW`; they cannot assert a trusted reviewer's approval.

The additive migration creates `verification_policies`, `trigger_rules` and `trigger_review_entries` with forced owner RLS and composite owner/vault reference constraints. Authenticated clients can insert/read but cannot update/delete individual planning entries. History follows vault and referenced record deletion cascades; it is not independently signed, administrator-proof or a backup. The only rule state is `DRAFT`; no activation RPC, background worker or grant mutation exists. Sensitive trigger type, authority, reviewers and evidence details remain encrypted.

Initial draft types: immediate, owner approval, specified date and emergency. Discover/view/download/coordinate describe intended scope only; current sharing separately implements its existing explicit permissions. Transfer, claim and ownership authority are rejected. Death/incapacity/legal-event plans are not accepted in this increment.

No UI or styles changed. The service is available for later integration into existing controls; production behavior remains unchanged until migration and frontend rollout.

## Activation gates still open

- Authenticated, independently bound reviewers and explicit reviewer acceptance.
- Evidence revision snapshots, reviewer decisions/signatures, replay prevention and approval expiration.
- Server-enforced recent authentication/MFA and Shield where required.
- Exact selected record/file revision scope, recipient-key binding, expiration and revocation.
- Atomic grant issuance only after distinct verification; no legal eligibility determination.
- Hosted adversarial acceptance before enabling any activation controls.

Tests cover real client encryption/decryption, plaintext transport rejection, topology tampering, foreign reviewer/record ownership, lock denial, prohibited authorities/types/approval outcomes, date validation and factual evidence expiration. PostgreSQL tests cover foreign record/policy/evidence references, owner spoofing, read isolation, ciphertext checks, append-only permissions, draft-only behavior, no grant creation and deletion lifecycle.

Validation: 235 tests across 55 files passed on the completed source; lint, PostgreSQL checks, encrypted restore, build and artifact checks passed. Existing main bundle-size warning remains. CSS artifact hash remains `index-58SJVvnB.css`. These checks do not constitute hosted trigger activation acceptance, physical-device testing or independent review.
