# Off-device Android static evidence review

This local tool reviews public phone B evidence using the [Android-recommended Kotlin verifier](https://github.com/android/keyattestation). It **cannot enroll, activate, reset or rotate any founder credential**. It has no listener or customer API integration and does not sign. Every result keeps `enrollment_allowed: false`.

## Pinned source and build

Upstream source is pinned at `621149c4ebaeeea844d6f43098687c73c4d370a3`. Review its Apache-2.0 license and source before use. It stays in the ignored tools directory; no third-party build scripts are executed. The separate build uses the installed Android Studio Java runtime and a pinned Kotlin compiler, with JVM target 17. Dependencies and compiler artifacts are listed with SHA-256 in `dependencies.lock.json`; builds reject missing locks, changed/missing artifact pins and source URL changes. Locks cannot be silently regenerated. These are upstream dependency versions, not a claim of a completed dependency audit or approved production release. They are not added to the customer bundle.

From the repository root:

```powershell
git clone --no-checkout https://github.com/android/keyattestation.git .local-release/founder-tools/android-keyattestation
git -C .local-release/founder-tools/android-keyattestation checkout --detach 621149c4ebaeeea844d6f43098687c73c4d370a3
node governance/attestation/build.mjs
node governance/attestation/review.mjs <public-phone-evidence.json> <independent-public-expectations.json>
node governance/attestation/check.mjs <local-static-review-directory>
```

Do not clone over an existing checkout. The build requires a clean source checkout at the pinned commit. Runtime artifacts, evidence, expectations, downloaded public trust data and reports remain under ignored `.local-release`. No real phone evidence or device identity belongs in Git.

The explicit expectations file contains:

```json
{
  "mode": "STATIC_EVIDENCE_REVIEW_ONLY",
  "expected_key_id": "<independently retained public SPKI SHA-256>",
  "expected_package": "com.lenvor.leqvor.founder",
  "minimum_app_version": 1,
  "expected_signer_sha256": "<independently verified APK signing certificate SHA-256>",
  "expected_challenge": "<expected base64 challenge, exactly 32 bytes>"
}
```

Take the signer fingerprint from the separately verified APK/publisher, not from the certificate being accepted. Choose a reviewed app-version minimum; the local first-creation check used version 1 as a baseline, which is not a production minimum-version policy. Matching a locally generated original challenge does **not** establish a fresh verifier-issued enrollment challenge.

## Verification boundary

The wrapper checks bounded input schema/key pins and downloads only Google's fixed official public root/revocation URLs. It never sends phone certificates, serials, keys or target artifacts over the network. It checks HTTPS response dates and cache age against the response's `max-age`, capped at one day, as specified by the [Android attestation guidance](https://developer.android.com/privacy-and-security/security-key-attestation). Failure, invalid data, stale trust information or verifier timeout denies review. Cached files alone are not accepted as fresh network results by the wrapper.

The upstream verifier handles certificate path/attestation parsing and revocation. Configuration explicitly disables software roots, requires STRICT package/signing-certificate matching, generated hardware origin and consistent non-software security levels, including the certificate's security-level claim. Additional constraints require hardware P-256/256-bit EC, signing-only purpose, SHA-256, hardware user authentication, absence of both hardware/software authentication-window and no-auth tags, and a locked VERIFIED boot state. No unknown-package exception or software-root test setting is enabled. Errors report only a fixed stage/failure class, never raw certificate contents or identifiers.

A successful result is `STATIC_EVIDENCE_PASSED`. It is not fresh key possession, independent human review, current boot attestation, patch-age-policy acceptance, proof of three distinct devices or production enrollment. It does not mutate a pin or convert captured self-generated evidence into a verifier-issued challenge. OS/vendor/boot patch months are reported for review, not silently accepted under an invented freshness policy.

## Local acceptance

On 15 October 2026, the actual phone evidence passed static review: TEE, locked VERIFIED boot, expected package/publisher and hardware authorizations. Reported patch months were OS `2026-08`, vendor/boot `2026-06`. The fresh root/revocation sources were recorded locally.

Ten off-device checks passed against an explicitly supplied local public review fixture: valid evidence, wrong signer, wrong package, wrong challenge, wrong public key, future app minimum, revoked leaf, absent trusted roots, truncated chain and modified signature. Inputs/output remain local. The harness checks that enrollment is disabled in every outcome. These checks do not replace upstream regression testing, an independent review or physical signing acceptance. No actual test evidence is embedded in repository tests or CI.
