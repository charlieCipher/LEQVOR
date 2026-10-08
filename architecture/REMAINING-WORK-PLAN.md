# Remaining architecture work — 9 October 2026

User instruction: work through these nine items in order. Future “continue” requests resume this plan. Record implementation separately from deployed and independently verified acceptance.

1. People: graph-linked person details, multiple roles and encrypted professional context. Connections view and professional fields are implemented and deployed as `15581fc` to `leqvor.vercel.app`; Vercel Production Ready and current domain verified. Unverified profiles can be edited with an encrypted-metadata nonce comparison to reject concurrent changes; recipient bindings and payload are preserved. Professional relationships have recorded Active/Former/Unknown state, never implied qualification verification. Full browser acceptance remains pending. Active access conditions depend on item 2/3.
2. Access and sharing: verified recipient identities, invitations, scoped grants, revocation and real two-account acceptance.
3. Triggers and verification: evidence, reviewers, expiry, decision history and approved activation; no automatic death/incapacity decisions.
4. Insurance: graph integration, distinct owner/insured/beneficiary roles, renewals, contacts and factual claim-readiness checks.
5. Continuity: meaningful completeness, gaps and reviews calculated from decrypted information.
6. Navigation/details: integrate Overview, Vault, People and Continuity with jurisdiction context.
7. Advanced security: finish and verify passkeys, devices, Shield and signed tamper-evident history. Document revision snapshots are not signed.
8. Recovery/operations: another-device recovery, separate encrypted backups, scheduling and cloud restore. Separate storage destination is not configured.
9. Launch acceptance: hosted browser workflows, device/accessibility checks, independent review and final reviewed legal documents.

Verified foundations: core hosted two-account vault/record/file API acceptance, graph/asset production SQL acceptance, deployed Documents and hosted Documents history API acceptance. Full browser and physical-device acceptance are not implied by these checks.

No new production permissions or migrations have been applied for item 1 in this increment. Professional details use existing encrypted person metadata. Relationship descriptions do not grant access or establish legal authority.

People validation: hosted ordinary-user API tests passed encrypted professional edits, stale-write rejection and cross-account edit isolation; disposable test accounts were removed. Focused component/service tests passed explicit reveal, focus-loss cleanup, late-response suppression, recipient-binding preservation, encrypted payload preservation and ownership/Cold Lock enforcement. All 210 regression tests across 49 files passed; lint and build passed with the existing bundle-size warning. Deployment `3fcCxMktfGs7dZ7ecrzFn3vAUK2r` is Ready and assigned to the production domain. Local evidence: `docs/people-deployment-ready.png`. No beneficiary role is inferred from a family relationship.

Next: item 2, Access and sharing. Do not mark items 2–9 complete from the People deployment.
