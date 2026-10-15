# Isolated founder device-key possession test

This test needs an existing local key A or B and its retained public evidence. It does not require or fabricate credential C, create a root policy, enroll a founder, execute an action, unlock a customer vault or change a password. Missing C still blocks the required 2-of-3 activation ceremony.

Requests use separate request/proof/result domains and the `PROVE_DEVICE_KEY_ONLY` purpose. They bind the exact evidence digest, key, slot, platform, UUID, random 256-bit nonce and ten-minute validity. Native clients display the request fingerprint and require private OS authentication against the existing key. They never create a missing key while testing. Off-device verification uses the locally retained issued request and public key. Acceptance creates an exclusive local receipt and refuses replay; this is not a production enrollment/replay database or attestation verdict.

From the repository root, only once the device operator is ready:

```powershell
node governance/device-test.mjs issue <retained-public-device-evidence.json>
```

Retain the issued directory and compare the printed request hash with the native console. Transfer only its `request.json` to the matching device. In Android preview 0.1.4 or the updated Windows console choose **Run isolated device-key test**, select the request, inspect it and approve privately with the OS prompt. Export the public result to a new filename, preserving the original evidence. Return that result JSON to the laptop:

```powershell
node governance/device-test.mjs accept .local-release/founder-device-test-<UUID> <exported-test-result.json>
```

Expired/cancelled tests need a new issued request. Do not extend timestamps, bypass evidence mismatch, reset keys or reuse a receipt. If existing evidence changed, stop and independently review a new public export. Automated acceptance uses ephemeral software test keys in memory; passing those checks does not establish physical signing.

Install 0.1.4 over the existing phone app without uninstalling or clearing data; retain the same package publisher. Real device approvals, independent Windows TPM validation, production enrollment, physical C and provider controls remain separate requirements.
