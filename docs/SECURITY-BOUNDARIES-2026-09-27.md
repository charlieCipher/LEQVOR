# Vault service boundary hardening

Record, people and document requests previously checked session generation when returning a result, but could start decrypting a response after Cold Lock. V5VaultService now checks the active generation immediately after asynchronous reads and before starting decryption. Record creation also checks after record encryption and after reading attachment bytes; updates check after metadata decryption before encrypting the next version.

Attachment enumeration now requires an unlocked session. Every returned attachment must match the vault owner, vault ID, requested record ID and canonical opaque owner/record/file path. Downloads reject malformed or mismatched paths before calling object storage. These client checks supplement database RLS and storage policies; they do not replace them.

Validation:

- 29 focused tests passed across session boundaries, real-crypto record lifecycle and V5 security.
- After adding the file-read lock regression, all 4 record lifecycle tests passed, including clearing the source byte buffer and preventing upload/commit after a lock during the read.
- Lint, production build and artifact checks passed.

The lifecycle tests use real cryptography with in-memory provider doubles. No production migration or live database/RLS test was performed in this pass. A read already sent over the network cannot be recalled. Cryptographic work already in progress may finish, but invalidated results are rejected; JavaScript cannot guarantee forensic memory zeroization.

Still separate work: live database adversarial validation, recipient-key/grant integration, device/passkey enrollment, signed approvals/history, restore evidence and independent review. No advanced feature was enabled or represented as working by these changes.
