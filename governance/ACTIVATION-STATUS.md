# Founder Authority activation status — 15 October 2026

**Inactive. No customer UI, password, vault, production API, database permissions or deployment changed by this increment.** Real A/B isolated key-possession signatures passed earlier. No physical C exists, and no policy using a fabricated C has been provisioned.

The [C-Ready preparation layer](C-READY-ENROLLMENT.md) records actual A/B public evidence while leaving C null/NOT_PROVISIONED. All recorded evidence remains pending independent acceptance. Its optional readiness assessment requires a complete three-key candidate, authenticated external acceptance adapters and an independently controlled matching policy pin; even ENROLLMENT_READY grants no authority or automatic activation. The existing protocol/engine remain unchanged.

Review branch published as draft [PR #1](https://github.com/charlieCipher/LEQVOR/pull/1). Hosted GitHub Actions passed on commit `2679487978148688b4aa316853a818ae07699d16` ([run](https://github.com/charlieCipher/LEQVOR/actions/runs/38727118819)). Subsequent changes require their own checks. The PR is not merged. Main branch protection was saved and read back after private owner verification on 15 October 2026.

16 October: the authorization timing fix (`93feeb8`) passed 385 local tests/90 files, seven control-service checks and [hosted security CI](https://github.com/charlieCipher/LEQVOR/actions/runs/38856874791). The subsequent [build-provenance implementation](BUILD-PROVENANCE.md) adds a main-only manual workflow with separate build/attestation permissions and bounded exact-candidate verification. It is prepared for review, not a hosted signed production build or provider deployment gate. The user confirmed that no separate governance or checkpoint resources exist yet; these live integrations remain pending independently of key C.

| Requested work | Evidence completed | Unfinished work / acceptance blocker |
| --- | --- | --- |
| Windows TPM validation | Bounded public-key/name binding; strict AIK certificate path to the separately fetched pinned Microsoft TPM root; AIK signature diagnostic; four new negative/positive software tests | Actual saved attestation uses SHA-1, not the strict SHA-256 policy; no verifier-issued enrollment nonce; revocation, hardware/authentication policy and independently controlled review host/reviewer still required. Enrollment remains denied. See `attestation/WINDOWS-REVIEW.md`. |
| Production governance integration | Existing separate gateway, access-token verification, mandatory live roles/revocation contracts, SQL state/journal and native signing paths compile and test | Separate governance datastore, independently controlled pins, admin identity/login/role directory, hosting, reviewed enrollment and action-specific provider adapters are not provisioned or fully connected. Customer Supabase is not a substitute for that authority. |
| Infrastructure enforcement | Main protection saved and read back: PR, one independent approval, stale-review dismissal, latest-push approval, required GitHub Actions `security` result, up-to-date branch, resolved discussions, no admin bypass, force pushes/deletions disabled | Eligible independent reviewer, Vercel/Supabase ownership, deployment bypass paths, signed build provenance and independent control of these settings remain unresolved. Ordinary application code cannot prevent its infrastructure owner from replacing that code or changing protection settings. |
| Independent checkpoints | New separate execution-checkpoint domain, native A/B signing, two-founder assembly, immutable read-back publication, fork/rollback detection and evidence restore. Existing root-state archive remains separate | No separate cloud destination or scheduler exists. Local files are not independent cloud retention. Per-execution archives do not prove global completeness. Policy-rotation continuity and live provider receipt reconciliation still need integration. |
| Lifecycle testing | Full local regression passed, including real isolated PostgreSQL lifecycle, cooling/confirmation, freeze, replacement planning, ambiguous execution and restore tests. Java/Windows canonical protocol checks passed | Synthetic keys/time/providers do not constitute an enrolled three-device ceremony, a real 72-hour cooling test or verified provider effects. Physical C and deployed reviewed integrations are prerequisites. |
| Independent review and activation | Self-review found the actual legacy Windows attestation and missing branch protections; reviewable implementation, tests and explicit deny-by-default boundaries are prepared | A separate qualified reviewer, approved production policies, all three independently verified devices and actual provider bypass tests are required. No authority activation or production security rating is claimed. |

## Validation for this increment

- **381 tests across 90 files passed**, plus **six** separate control-service acceptance tests.
- Full ESLint check passed; root and control dependency audits reported zero advisories at review time.
- PostgreSQL database isolation/authorization checks and encrypted restore checks passed.
- Customer production build/artifact checks passed with existing assets `index-CfvBoNr3.js`, `index-58SJVvnB.css`, `crypto-js-B8AJLl07.js`.
- A subsequent packaging hardening check passed seven focused build/release tests: customer output rejects governance source, local evidence directories and signing/binary artifacts. `governance` is excluded from customer Vercel uploads. This changes packaging validation, not the UI or deployed site.
- Windows native build: zero warnings/errors. Java/Node and Windows/Node protocol checks include execution-journal tampering and separate signature domains. Android 0.1.5 built and was signed with the existing local preview publisher; it has not been physically accepted for the new checkpoint workflow or promoted to a trusted production release.
- Actual Windows static report status: `BLOCKED_LEGACY_SHA1_ATTESTATION`; report and original public evidence remain outside Git. Its review ran outside the signer on the same laptop, not on an independently controlled host.

## Next manual inputs and dependent engineering

1. Obtain an eligible independent reviewer; do not approve your own PR or disable the saved main protection to merge. CODEOWNERS approval is not enabled because the sole configured owner is the PR author. Saved protection is not proof that a provider owner cannot change it.
2. Provide a physically separate C device and separate governance/checkpoint resource names. Do not send keys/PINs in chat. No account or paid storage was created without a destination.
3. Approve a reviewed Windows enrollment/attestation path after the SHA-1 finding. Do not reset the TPM/key or silently permit weaker attestation.
4. Implement/configure concrete identity, role/revocation, provider-fence/receipt and policy-rotation adapters on the separate infrastructure. Configure credentials privately, then test real deployment/ownership bypasses before activation.
5. Have a separate qualified security reviewer assess the code/policy and run the real three-device, cooling, freeze, replacement and cloud-restore acceptance ceremonies. A self-review is not an independent review.

These are real dependencies and unfinished integrations, not items that can be marked complete from passing unit tests or a signing screenshot.
