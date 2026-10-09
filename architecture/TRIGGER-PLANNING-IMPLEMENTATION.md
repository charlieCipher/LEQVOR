# Trigger and verification planning

9 October 2026 — local implementation, not applied to production. Earlier increment notes below are historical; the delivery/owner-authorization increment now connects existing dialogs as described in ITEMS-1-6-ROLLOUT.md.

## Delivery and explicit owner authorization

The review-delivery migration adds immutable encrypted recipient-specific context packets, readable only by the assigned reviewer while the accepted target share remains current. Each packet has an independent DEK; the owner VMK wrapper is excluded. The client binds revealed content to request/manifest IDs and hash, and drops it after 30 seconds, focus loss or vault lock. An undelivered request cannot receive a verified decision.

The final recipient account/public key is committed into the manifest before reviews are requested. The atomic authorization RPC rechecks threshold, revisions, expiry, accepted reviewer grants, exact recipient key and recent authentication/MFA. A manifest can produce one pending selected-record invitation; it never automatically activates access. Changing the recipient, replaying authorization or revoking an approval grant prevents authorization. Recipients still accept the invitation. This is an administrative approval workflow, not legal eligibility, a universal Shield subsystem or emergency automation.

Signing-card registration and independent pin confirmation use existing People/Security controls. Emergency Access prepares OWNER_APPROVAL/VIEW review requests, and Review Permissions reveals context, signs decisions and lets the owner explicitly authorize eligible manifests. Evidence copies require explicit selection/consent and exclude attachments/unrelated links. Hosted acceptance remains pending deployment of all seven migrations listed in ITEMS-1-6-ROLLOUT.md.

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

The initial administrative decisions were unsigned. The following increment adds client-verified signatures, but still does not establish proof of legal identity/qualification or approval of death/incapacity/claim eligibility. The server cannot read the encrypted reviewer roster, approval threshold or evidence requirements; a separately committed, server-verifiable policy/evidence manifest is still required before any threshold can authorize activation. Review controls and encrypted context delivery are not yet wired into the existing UI. No production permissions are changed in this increment.

Increment validation: 237 tests across 56 files passed; lint, PostgreSQL permissions/adversarial checks, build/artifact checks and the existing core encrypted restore passed. This restore covers existing core record/file data, not preservation of the new review tables. The current UI/CSS remains unchanged. Hosted review acceptance and deployment remain pending.

Tests cover real client encryption/decryption, plaintext transport rejection, topology tampering, foreign reviewer/record ownership, lock denial, prohibited authorities/types/approval outcomes, date validation and factual evidence expiration. PostgreSQL tests cover foreign record/policy/evidence references, owner spoofing, read isolation, ciphertext checks, append-only permissions, draft-only behavior, no grant creation and deletion lifecycle.

Validation: 235 tests across 55 files passed on the completed source; lint, PostgreSQL checks, encrypted restore, build and artifact checks passed. Existing main bundle-size warning remains. CSS artifact hash remains `index-58SJVvnB.css`. These checks do not constitute hosted trigger activation acceptance, physical-device testing or independent review.

## Client-verified signing increment

`20261009_signed_trigger_reviews.sql` introduces a separate immutable account signing identity. ECDSA P-256/SHA-256 keys are generated on the client; private JWK material is encrypted under an independent DEK wrapped by the reviewer's VMK. This does not reuse the ECDH sharing key. Registration requires recent authentication/MFA and ownership of the vault; no client replacement/update permission exists. This increment does not implement signing-key rotation/recovery beyond the normal encrypted VMK recovery mechanism.

Owner requests require an independently pinned signing-key binding on the selected person (account, key ID, public key, fingerprint and verification date) in addition to the sharing-key binding. The server compares the expected signing key with the registered account key and snapshots it on the request. The signature commitment includes a domain/version, request/owner/vault/rule/grant/reviewer/key IDs, exact revision, normalized expiration and decision outcome. Substituting any of these invalidates verification.

The unsigned RPCs become private authorization helpers. The public decision RPC requires a signature and the unchanged registered signer. PostgreSQL validates the envelope shape and account attribution; it does **not** perform ECDSA verification. A malicious authenticated client can still submit a well-shaped invalid signature, which the receiving client must reject. `reviews()` returns `UNVERIFIED` unless verification succeeds against a caller-held independent key pin. A key included in the decision itself is never sufficient. Valid signatures on expired, cancelled or revoked requests remain historical evidence only and their current state is `UNAVAILABLE`.

No activation may rely solely on these stored decisions. The following increment supplies server signature verification, but policy/evidence commitments, threshold enforcement, signed-key distribution through existing controls, hosted acceptance and activation remain unfinished. No UI, production migration or deployment changes are included.

Signing increment validation: 239 tests across 57 files passed. Lint, PostgreSQL ownership/permission checks, build/artifact checks and the existing core encrypted restore passed. Signature tests use real Web Crypto keys and reject replay across request context, changed outcomes, substituted keys, malformed signatures and wrong vault keys. SQL tests verify immutable registration, owner isolation, independently expected key matching, private-key/plaintext rejection and denial of unsigned helper access. PostgreSQL's signature-shape fixture is deliberately not claimed as ECDSA verification. CSS artifact remains unchanged; the existing main bundle-size warning remains.

## Server signature verification increment

`POST /api/trigger-review` accepts only the request ID, outcome and signature. It authenticates the exact bearer token against the fixed Supabase project before extracting the verified token's identity/issuer/audience/role/expiry/AMR/assurance claims. It reads the request with the caller's normal RLS permissions, checks the assigned reviewer, and verifies real ECDSA over the request's captured signing key and full decision context. No vault private key, evidence plaintext or policy content is sent to the API.

Only after signature verification does the API construct a privileged writer and call `record_verified_v5_trigger_decision`. That function is executable only by `service_role`, requires a service-role JWT context, and rechecks the exact verified snapshot. It locks grant then request, checks expiry after acquiring locks, and delegates to the existing atomic account/MFA/revocation/replay/signing-key checks using only the Auth-verified reviewer claims. It restores the writer's original transaction-local claims afterward. Decisions written this way are marked `server_signature_verified=true`; existing entries remain false. Direct authenticated execution of the old signed RPC is revoked, preventing signature-verification bypass.

The client submits decisions through this same-origin API and requires both the server flag and its own ECDSA verification against an independent pin. Responses are no-store, failures are sanitized and no bearer token is forwarded into database arguments or logging. The service-role credential remains server-only. This endpoint uses existing production server configuration, but its migration/API are not deployed yet. The server is trusted for operational authorization; this does not make database administrator tampering impossible, which is why clients still verify signatures.

The PostgreSQL test runner validates earlier review RPC contracts before applying the final migration, then verifies that those routes are deliberately revoked in the final schema. API tests use real ECDSA with a mocked Auth/transport boundary; PostgreSQL tests use actual database authorization/transactions with a signature-shape fixture. Neither is claimed as a real hosted two-account review workflow.

Server increment validation: 243 tests across 58 files passed; lint, PostgreSQL checks, core encrypted restore, build/artifact and release-configuration checks passed. Existing bundle-size warning remains; CSS hash is unchanged. No live migration or deployment occurred. The following increment supplies committed manifests and administrative threshold checks; activation integration is still pending.

## Policy/evidence manifest and threshold increment

`20261009_trigger_manifests.sql` creates owner-only immutable manifest snapshots through a recent-authenticated RPC. A snapshot records the encrypted policy/rule payloads, encrypted target/evidence metadata and payloads at exact record revisions, selected reviewer accounts/signing keys/accepted grants, evidence observation times/requirement slots, the administrative approval threshold and expiration. It contains no owner DEKs, plaintext titles, evidence descriptions or instructions. It is an audit snapshot, not a replacement for the relational Continuity Graph.

The server validates owner/vault/revision relationships; every reviewer must have a current accepted share of the target revision and the expected registered signing key. Duplicate reviewer accounts and duplicate evidence records/slots are rejected. Each requirement has one evidence reference. Future-dated, expired and stale evidence references are rejected. Expiration is the earliest of seven days, selected share expiration and evidence observation plus the policy window. Outstanding manifests are bounded to 100 per owner and snapshots to 4,000,000 encoded bytes.

The client decrypts the immutable policy first and submits the threshold, expiration window and reviewer/evidence references from that policy. It independently checks selected people/sharing/signing pins and the returned encrypted snapshots. The server cannot infer the meaning of encrypted evidence descriptions or whether a document legally satisfies a requirement: these are explicitly owner-declared administrative requirements, subject to human review. No automated legal/medical eligibility determination is added.

The manifest hash is standard SHA-256 over the PostgreSQL JSONB text encoding of the server-built snapshot. It commits to all captured fields; this encoding must be preserved/verified during any later manifest export/restore implementation. Clients check the returned policy and evidence bindings; they do not claim independent reimplementation of PostgreSQL's text encoding. New request creation requires a manifest and captures its ID/hash. Version 2 decision signatures bind both manifest fields; old version 1 decisions do not count toward manifest readiness. The server writer rejects missing/changed/corrupt manifest context.

`v5_trigger_manifest_readiness` checks snapshot/hash/header integrity, current target/evidence revisions and ciphertext, policy/rule ciphertext, and live distinct reviewer decisions with server-verified signatures. Cancelled/expired requests, revoked/expired shares, removed signing keys and unsigned decisions do not count. A current rejection blocks readiness. Results are `NEEDS_REVIEW`, `BLOCKED`, `STALE`, `EXPIRED` or `READY_FOR_OWNER_REVIEW`; every result has `activation_enabled=false`. Readiness is a status query, not a transaction authorizing subsequent access. Atomic revalidation during any future grant issuance is still required.

All trigger migrations and behavior remain local. Evidence/context delivery to reviewers, signing-key pin controls in the existing UI, explicit owner authorization/Shield where needed, atomic selected grant activation, hosted acceptance and review-data backup/restore remain unfinished. The core restore check does not cover these new tables.

Manifest increment validation: 245 tests across 59 files passed; lint, PostgreSQL authorization/threshold checks, build/artifact/release configuration and existing core restore passed. PostgreSQL tests cover threshold progression, distinct accounts, rejected/unverified/revoked decisions, removed sharing identities, stale target/evidence revisions and expiry. Client/API tests cover opaque-only request transport, returned encrypted snapshot checks and signature binding to manifest ID/hash. CSS is unchanged; the existing bundle-size warning remains.
