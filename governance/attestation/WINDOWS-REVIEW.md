# Windows A static evidence review

15 October 2026: the actual retained public evidence was reviewed outside the signing application, on the same laptop. This is not verification on an independently controlled host or an independent review. The Windows Hello possession test passed separately; possession alone is not hardware attestation acceptance.

`windows-evidence.mjs` bounds and decodes the observed KAST wrapper, Microsoft PCP KADS structure and TCG TPM 2.0 CERTIFY/public-key structures. The SHA-256 public name matches the certified TPM public area, which matches the retained A RSA SPKI. Fixed-TPM, fixed-parent and sensitive-data-origin flags are required. Binary parsing is not a homemade cryptographic algorithm; RSA/SHA verification uses Node/OpenSSL.

`review-windows.mjs` extracts the public PKCS7 certificate chain with the installed OpenSSL, verifies it in strict mode against a separately downloaded and SHA-256-pinned Microsoft TPM Root Certificate Authority 2014, checks validity/CA constraints and requires AIK EKU 2.23.133.8.3. It fetches only the fixed public root URL; certificates, serials and evidence are not uploaded. It never opens a key or triggers authentication. The hard-coded OpenSSL path is a local review dependency, not a production trust boundary.

```powershell
node governance/attestation/review-windows.mjs <retained-public-Windows-evidence.json>
npx vitest run tests/founder-windows-evidence.test.js
```

The actual result is **BLOCKED_LEGACY_SHA1_ATTESTATION**, with exit code 2: the AIK signature validates under SHA-1, not the strict SHA-256 policy. Diagnostic recognition does not approve SHA-1; the strict verifier rejects it. The evidence has no verifier-issued enrollment nonce. Revocation validation, accepted hardware/patch/authentication policy and an independent implementation review remain incomplete. Reports always set `enrollment_allowed:false` and `founder_authority_active:false`; do not treat certificate-path success as enrollment approval.

Do not clear/reset the TPM, delete key A, change the Windows PIN or silently relax the digest requirement. A reviewed stronger attestation/enrollment path or an explicitly reviewed compatibility policy is still needed. No such policy exception was enabled by this review.

Primary format and trust references: [Microsoft TSS PCP header](https://github.com/microsoft/TSS.MSR/blob/main/PCPTool.v11/inc/TpmAtt.h), [Microsoft TPM 2.0 implementation](https://github.com/microsoft/TSS.MSR/blob/main/PCPTool.v11/dll/TPM20.cpp), [Windows Hello authentication service](https://learn.microsoft.com/en-us/windows/apps/develop/security/windows-hello-auth-service), [Microsoft public TPM root](https://www.microsoft.com/pkiops/certs/Microsoft%20TPM%20Root%20Certificate%20Authority%202014.crt). These are implementation/trust references, not an independent audit of LEQVOR.
