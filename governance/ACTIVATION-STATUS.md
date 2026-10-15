# Founder Authority activation status — 15 October 2026

**Inactive. No customer UI, password, vault, production API, database permissions or deployment changed by this increment.** Real A/B isolated key-possession signatures passed earlier. No physical C exists, and no policy using a fabricated C has been provisioned.

Review branch published as draft [PR #1](https://github.com/charlieCipher/LEQVOR/pull/1). Hosted GitHub Actions started and passed setup, dependency audits, control tests and lint; its full test/build run was still pending at this update. The PR is not merged. Main branch protection remains awaiting private GitHub Confirm access and read-back verification.

| Requested work | Evidence completed | Unfinished work / acceptance blocker |
| --- | --- | --- |
| Windows TPM validation | Bounded public-key/name binding; strict AIK certificate path to the separately fetched pinned Microsoft TPM root; AIK signature diagnostic; four new negative/positive software tests | Actual saved attestation uses SHA-1, not the strict SHA-256 policy; no verifier-issued enrollment nonce; revocation, hardware/authentication policy and independently controlled review host/reviewer still required. Enrollment remains denied. See `attestation/WINDOWS-REVIEW.md`. |
| Production governance integration | Existing separate gateway, access-token verification, mandatory live roles/revocation contracts, SQL state/journal and native signing paths compile and test | Separate governance datastore, independently controlled pins, admin identity/login/role directory, hosting, reviewed enrollment and action-specific provider adapters are not provisioned or fully connected. Customer Supabase is not a substitute for that authority. |
| Infrastructure enforcement | Actual GitHub UI confirmed no classic branch protection; public API reported no rulesets. Prepared main PR/review/no-bypass protection; pinned CI commits verified to exist; dependency audits found no advisories | GitHub save stopped at private “Confirm access”; saving and read-back are not yet confirmed. Required security status must be configured after a real hosted run. Vercel/Supabase ownership, deployment bypass paths, signed build provenance and independent control of these settings remain unresolved. Ordinary application code cannot prevent its infrastructure owner from replacing that code. |
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

1. Privately finish GitHub Confirm access, then verify the saved main rule and require the actual hosted `security` result. Add an eligible independent reviewer; do not approve your own PR or disable review requirements to merge.
2. Provide a physically separate C device and separate governance/checkpoint resource names. Do not send keys/PINs in chat. No account or paid storage was created without a destination.
3. Approve a reviewed Windows enrollment/attestation path after the SHA-1 finding. Do not reset the TPM/key or silently permit weaker attestation.
4. Implement/configure concrete identity, role/revocation, provider-fence/receipt and policy-rotation adapters on the separate infrastructure. Configure credentials privately, then test real deployment/ownership bypasses before activation.
5. Have a separate qualified security reviewer assess the code/policy and run the real three-device, cooling, freeze, replacement and cloud-restore acceptance ceremonies. A self-review is not an independent review.

These are real dependencies and unfinished integrations, not items that can be marked complete from passing unit tests or a signing screenshot.
