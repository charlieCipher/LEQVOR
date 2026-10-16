# Isolated founder device-key possession test

This test needs an existing local key A or B and its retained public evidence. It does not require or fabricate credential C, create a root policy, enroll a founder, execute an action, unlock a customer vault or change a password. Missing C still blocks the required 2-of-3 activation ceremony.

Requests use separate request/proof/result domains and the `PROVE_DEVICE_KEY_ONLY` purpose. They bind the exact evidence digest, key, slot, platform, UUID, random 256-bit nonce and ten-minute validity. Native clients display the request fingerprint and require private OS authentication against the existing key. They never create a missing key while testing. Off-device verification uses the locally retained issued request and public key. Acceptance creates an exclusive local receipt and refuses replay; this is not a production enrollment/replay database or attestation verdict.

From the repository root, only once the device operator is ready:

```powershell
node governance/device-test.mjs issue <retained-public-device-evidence.json>
```

Retain the issued directory and compare the printed request hash with the native console. On Android transfer its `request.json`; on Windows use `windows-test-input.json`, which contains the exact issued request plus the original retained public evidence. Choose **Run isolated device-key test**, select that native input, inspect it and approve privately with the OS prompt. Export the public result to a new filename, preserving the original evidence. Return that result JSON to the laptop:

```powershell
node governance/device-test.mjs accept .local-release/founder-device-test-<UUID> <exported-test-result.json>
```

Expired/cancelled tests need a new issued request. Do not extend timestamps, bypass key/chain/retained-evidence mismatch, reset keys or reuse a receipt. Automated acceptance uses ephemeral software test keys in memory; passing those checks does not establish physical signing.

During actual Windows diagnostics the original key and certificate-chain bytes matched exactly, while two OS attestation blobs differed. Therefore Windows checks the fresh OS attestation success, unchanged live public key and unchanged certificate chain against the original evidence, and signs the digest of that original retained artifact. It does not compare regenerated attestation blobs for byte equality or claim their independent TPM validation. An evidence/key/chain substitution remains blocked. The read-only `--inspect-device-test <windows-test-input.json>` option checks this boundary without signing, creating a key or opening authentication prompts. Independent TPM validation remains necessary before founder enrollment.

Install 0.1.4 over the existing phone app without uninstalling or clearing data; retain the same package publisher. Real device approvals, independent Windows TPM validation, production enrollment, physical C and provider controls remain separate requirements.
