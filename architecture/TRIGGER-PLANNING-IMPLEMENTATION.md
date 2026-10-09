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

## Authenticated administrative review increment

`20261009_trigger_reviews.sql` adds request/decision storage and narrow RPCs, still local and not deployed. An owner with recent authentication requests review against an accepted, unexpired selected share of the rule's record. The server captures the grant recipient and exact shared revision; the caller cannot nominate a different decision author. Requests expire within seven days or at the share expiration, whichever comes first. Duplicate current requests for the same rule/share are rejected; outstanding requests are bounded to 100 per owner.

Only that authenticated recipient can record one decision (`APPROVED`, `REJECTED`, `NEEDS_REVIEW`), with recent authentication and configured MFA enforced by the existing sharing gate. Decisions cannot be replayed or directly rewritten by clients. Owners can cancel requests; revoked/expired shares, cancelled/expired requests and deleted sharing identities block new decisions. The service treats retained decisions as unavailable when their request/share ceases to be current. It never converts an approval into a grant or active rule.

Request/decision tables expose only participant IDs, selected revision, timestamps and the administrative decision enum to their participants. They contain no plaintext evidence, policy descriptions or notes. Participants do not receive access to the owner's policy/rule/evidence tables. The client checks the selected person's independently pinned sharing key and membership in the decrypted policy before requesting review.

These are authenticated account-attributed administrative decisions on an already shared revision, not cryptographically signed attestations, proof of legal identity/qualification, or approval of death/incapacity/claim eligibility. The server cannot read the encrypted reviewer roster, approval threshold or evidence requirements; a separately committed, server-verifiable policy/evidence manifest is still required before any threshold can authorize activation. Review controls and encrypted context delivery are not yet wired into the existing UI. No production permissions are changed in this increment.

Increment validation: 237 tests across 56 files passed; lint, PostgreSQL permissions/adversarial checks, build/artifact checks and the existing core encrypted restore passed. This restore covers existing core record/file data, not preservation of the new review tables. The current UI/CSS remains unchanged. Hosted review acceptance and deployment remain pending.

Tests cover real client encryption/decryption, plaintext transport rejection, topology tampering, foreign reviewer/record ownership, lock denial, prohibited authorities/types/approval outcomes, date validation and factual evidence expiration. PostgreSQL tests cover foreign record/policy/evidence references, owner spoofing, read isolation, ciphertext checks, append-only permissions, draft-only behavior, no grant creation and deletion lifecycle.

Validation: 235 tests across 55 files passed on the completed source; lint, PostgreSQL checks, encrypted restore, build and artifact checks passed. Existing main bundle-size warning remains. CSS artifact hash remains `index-58SJVvnB.css`. These checks do not constitute hosted trigger activation acceptance, physical-device testing or independent review.
