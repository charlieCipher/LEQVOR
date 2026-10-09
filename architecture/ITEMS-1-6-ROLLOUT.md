# Items 1–6 implementation and rollout

9 October 2026. Scope is the numbered nine-item plan in REMAINING-WORK-PLAN.md: People, sharing, manual verification, Insurance, Continuity and navigation/details. Advanced security remains item 7.

The existing visual design is preserved. No stylesheet, background, font or layout system was changed. Functional controls use existing forms and dialogs.

## Implemented locally

- People: existing encrypted professional/relationship fields and independently verified sharing cards remain; a separately fingerprint-confirmed ECDSA reviewer card can now be pinned without replacing an existing pin.
- Sharing: existing accepted, revision-specific, expiring selected shares remain the prerequisite for review. Reviewer context is separately encrypted with an independent DEK and delivered only to the assigned reviewer. Evidence attachments and unrelated linked records are excluded.
- Manual verification: immutable manifests bind selected evidence revisions, policy, reviewer keys, threshold, expiry and final recipient key. Reviewers explicitly reveal context, then sign an administrative decision. The same-origin API verifies ECDSA before the privileged writer accepts a decision. The owner must reauthenticate and explicitly authorize a new pending invitation; the recipient must accept. Authorization is atomic and one-use. No automatic emergency, death, incapacity or legal eligibility determination exists.
- Insurance: POLICY entities and role-specific person/asset edges save atomically with encrypted record/file metadata. Owner, insured, beneficiary and trusted-person roles remain distinct. Claim-readiness checks require all references to exist. Renewal dates and descriptive indexes stay inside encrypted metadata; reminders shown in the client are factual, not advice or scheduled email delivery.
- Continuity: readiness checks current reviews, actual linked records/people, documented ownership/beneficiaries, original-document custodians and recorded jurisdiction context. Missing links reduce completeness rather than treating an arbitrary ID as completion.
- Navigation: person links open the selected person; asset detail links include inverse insurance/document relationships. Demo query handling remains isolated to preview mode.

## Production dependency

Initial read-only production SQL inspection returned false for trigger_rules, trigger_manifests, save_vnext_policy and authorize_v5_reviewed_invitation. After explicit user approval, the seven-migration bundle was applied successfully; repeat inspection returned true for these components and trigger_review_packets. Frontend/API source b9d529a is deployed: Vercel deployment 6yXufhURvykCvhTjFohz77hrv97E, Production Ready, assigned to leqvor.vercel.app.

Apply the following tested additive migrations in order before deploying their frontend/API:

1. 20261009_trigger_planning.sql
2. 20261009_trigger_reviews.sql
3. 20261009_signed_trigger_reviews.sql
4. 20261009_verified_trigger_decisions.sql
5. 20261009_trigger_manifests.sql
6. 20261009_review_delivery.sql
7. 20261009_insurance_workflow.sql

Production target: awdsyhxdnyfilnzamflt. These add security-sensitive RPC permissions, so browser action-time confirmation is required. Existing owner-only record/storage policies are retained; new reviewer packet access requires an accepted, current share and exact assigned account. Owner VMK wrappers are excluded from delivered context.

Validation: 253 regression tests across 62 files passed, followed by 10 focused account/record tests after tightening immutable record types. Lint, all 17 PostgreSQL SQL groups plus schema readiness, core encrypted restore, build/artifact and release-configuration checks passed. Hosted ordinary-user selected-sharing/HTTP download/revocation/isolation tests passed; synthetic records and both temporary accounts were removed. Existing bundle-size warning remains. CSS remains index-58SJVvnB.css.

## Acceptance limits

Local PostgreSQL tests cover authorization, rollback, stale writes, isolation, recipient substitution, expired/revoked context and replay. SQL signature fixtures test database contracts, not ECDSA verification; API/client tests verify real signatures separately. Existing core restore tests do not certify preservation of new review tables.

Hosted ordinary-user acceptance passed Insurance graph creation/edit, stale-write rejection, encrypted upload/download/decryption and cross-account isolation. It also passed committed encrypted review delivery, explicit reveal/decryption, real ECDSA approval through the deployed API, owner authorization, recipient acceptance, one-use replay rejection and revocation. Synthetic records/files and both disposable accounts were removed and account absence verified. The first teardown attempt tried deleting vaults before their sharing identities and was rejected; the harness now follows the existing account-owned cleanup sequence, without changing production permissions.

Hosted browser acceptance of every dialog and physical-device testing remain separate from API/service acceptance. Another physical device, separate backup destination/cloud restore, independently reviewed legal documents and an independent security reviewer remain outstanding. No independent audit or universal Shield completion is claimed.
