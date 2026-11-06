# LEQVOR launch acceptance — 6 October 2026

This is an implementation and evidence register, not an independent audit or launch approval.

## User decisions

- Keep the existing interim privacy notice and terms while the operator prepares reviewed documents. The approved temporary contact is unchanged.
- Keep cloud backup storage and cleanup scheduling deferred. Do not enable either implicitly.
- User reports having checked sign-in. The two available hosted authentication tabs were still signed out during this session; no authenticated hosted test result is inferred from that report.

## Outstanding acceptance

| Area | Evidence now | Required to close |
| --- | --- | --- |
| Hosted CRUD and isolation | Local PostgreSQL/crypto fixtures exist; hosted anonymous denial and headers pass | Active sessions for two authorized test accounts; test synthetic records/files and deny cross-account reads, writes and storage access |
| Recovery | Separate-process recovery and local restore tests exist | Recover a synthetic vault on another physical device; record device/browser and result without secrets |
| Sharing | Client cryptographic grants, key rotation and fingerprint verification primitives | Recipient identity verification, encrypted fingerprint pins, invitation lifecycle, server activation/expiry/revocation, transactional replacement grants, UI integration and hosted tests |
| Advanced security | MFA and Cold Lock implemented; record history signature primitive | Server-issued WebAuthn challenges and verification, device enrollment/revocation, one-time signed Shield approvals, trusted history anchors and live acceptance |
| Backups and cleanup | Cleanup endpoint guarded and disabled; local restore tooling | User-selected independent storage, configuration, scheduled ciphertext copies and cloud restore; renewed cleanup configuration |
| Device and independent review | Responsive/component evidence and reviewer brief exist | Vivo/TalkBack and second-device results; independent reviewer with agreed scope and retest |
| Legal | Interim pages published | Operator-provided confirmed legal details and professional review; not claimed complete |

## Changes in this pass

- Recipient grants now require a matching independently verified public-key fingerprint. Thumbprints follow RFC 7638. A fingerprint alone is not identity verification; no server-supplied pin is automatically trusted.
- Grant decryption checks owner, vault, recipient, record, permission and format version bindings.
- Signed record history verification requires the expected record ID, rejects mixed-record chains and handles malformed input by returning a verification failure.
- Updated source-map-js from 1.2.1 to 1.2.2 after the audit detected a high-severity advisory.

These changes improve the primitives. They do not enable live sharing, passkeys, device trust, Shield or a verified security timeline.

## Validation in this pass

`npm run verify` passed: 178 tests in 37 files, zero known dependency vulnerabilities, zero-warning lint, local PostgreSQL isolation/transaction/envelope checks, synthetic encrypted restore and recovery checks, and build/artifact checks. The large bundle warning remains. Hosted read-only checks passed for anonymous table permission denial and HTTPS routes/security headers. These are not authenticated hosted cross-account tests, a cloud restore, or independent review.

## Physical-device handoff

Use synthetic data only. On Vivo, record model, Android version, browser version and date. With TalkBack enabled, verify sign-in field labels and errors; vault unlock; record creation with a small synthetic attachment; reveal; concealment on backgrounding; edit; confirmation before deletion; modal focus and return; portrait/landscape and enlarged text. On a second trusted physical device, recover using the phrase privately and confirm the same synthetic record and file decrypt. Never include passwords, recovery words, OTPs or decrypted personal documents in evidence.

The independent review brief is in `INDEPENDENT-REVIEW-BRIEF.md`. Supply the actual tested commit and code diff, not an old baseline, before review begins.
