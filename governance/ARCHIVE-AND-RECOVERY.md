# Root governance archive and device-loss planning

13 October 2026. Local acceptance tooling; **not production activation, scheduled cloud backups, customer vault backups or a device recovery service**.

## Verified retention and restore

`archive.mjs` verifies a complete public root snapshot against a two-founder signed advancing checkpoint and an independently retained parent anchor. It checks the audit prefix for a fork, commits the predecessor archive digest, publishes by content digest, then downloads and verifies the retained object again. Replayed checkpoints, substituted state, missing quorum and mismatched independently supplied digests are rejected.

The injected storage contract is `putIfAbsent(digest, bytes)` and `get(digest)`. The provider must implement atomic create-if-absent, independently controlled retention and bounded reads. It must not provide a mutable `latest` file as the trusted head. The returned `{archive_hash, checkpoint}` must be retained independently of the primary database and archive bucket.

`file-archive-store.mjs` is a local export/acceptance adapter. It writes and synchronizes a temporary file, then atomically publishes a hard link without overwriting an existing digest. It does not promise protection against the laptop/storage owner, cloud Object Lock or power-loss durability of the directory entry. Existing corrupted objects fail verification rather than being repaired silently.

From the repository root, with **public** JSON inputs:

```powershell
node governance/archive-cli.mjs retain independent-policy.json public-snapshot.json signed-checkpoint.json independent-parent-anchor.json C:\FounderArchive
node governance/archive-cli.mjs restore independent-policy.json independent-parent-anchor.json <independently-retained-archive-digest> C:\FounderArchive new-verified-authority.json
```

The first operation emits the new public anchor. The second writes `{policy, checkpoint, state}` to a new file and refuses to overwrite it. It never updates a database, enrolls a founder, changes the root pin or activates restored authority. Restoring an old signed file is not authorization to roll production back: compare its head to the latest independently retained checkpoint before any reviewed recovery ceremony.

Inputs/objects are capped at 4 MiB. Native imports currently have a smaller 64 KiB limit; larger restored histories need native archival support before import. This archive format currently covers a **single pinned policy**. Policy-rotation chains and the separate execution journal need their own reviewed checkpoint continuity; they are not covered by these root snapshot signatures.

A scheduled retention worker may copy and verify **already signed** packets. It cannot create new founder signatures while the founder devices are offline. No scheduler, cloud bucket, credentials or independent storage account is configured.

## One-device replacement planner

`planDeviceReplacement` is an offline, non-mutating verifier. It requires:

- A fully authorized `REPLACE_FOUNDER_IDENTITY` action under the existing policy: both distinct-device quorums, cooling period, final confirmation, exact public target and unexpired request.
- An independently verified registry of all three current public keys bound to three distinct physical device identities.
- A new slot-matching public credential, fresh evidence committed by the target, and an injected independent hardware-attestation verifier. The new physical identity must differ from every current device.
- A fresh signature by the replacement key over `leqvor-founder-device-possession-v1`, bound to the exact final request, current policy, new key and evidence digest. An existing founder action signature cannot substitute for this proof.

The output is a `REVIEW_REQUIRED` candidate policy and revoked/new public-key fingerprints. Quorum remains 2-of-3. Nothing is enrolled, revoked, written, executed or made authoritative by this plan. The real executor must re-read live authority and enforce the provider fence at the actual effect; an offline plan or frozen snapshot is not an execution permit.

Tests simulate loss of A and approval by B+C, reject reused physical identities, invalid evidence/possession and expiration during slow verification. Disposable software test keys stay in memory and are not founder credentials.

## Remaining integration

The Windows A and Android B clients now implement local replacement-possession signing. Import the newest independently retained `{policy, checkpoint, state}`, then a separate `{request, target, evidence}` replacement packet. The request must be the unexpired CONFIRM action recorded as AUTHORIZED in that anchored state, with the one-step authorization version advance and no freeze. Both clients verify the entire target/evidence commitment, prior slot key and valid new candidate policy. The local hardware key must match the new public credential. They display possession-only consequences, require Windows Hello or per-operation biometric/PIN, recheck expiry after authentication and export only the public `{slot, key_id, signature}` proof. Root-action and checkpoint bytes cannot substitute for possession bytes.

Java/.NET/Node acceptance vectors use actual synthetic root proposal, two approvals, 72-hour cooling and a second two-approval confirmation, for both A and B replacement. They compare signing bytes and reject changed evidence, wrong slots and expired packets. Windows compiled with zero warnings/errors; Android compiled an unsigned APK. These checks did not create, enroll or test any real hardware key. A newly created local credential still needs independent hardware verification; collecting its proof is not enrollment or execution.

Implement independent TPM/Android evidence validation against an enrollment challenge, actual recovery device C, reviewed registry provenance and atomic policy/key-pin rotation with protected provider receipts. Catastrophic recovery remains unimplemented and has no admin reset, single-phrase override or quorum reduction. A signed imported snapshot does not provide a live provider fence: the backend planner/executor must still verify current root authorization and real independently protected state at the actual effect.

Then configure separately controlled storage, implement policy-rotation/execution-history checkpoint continuity, schedule verified retention and perform a cloud restore test. Physical key creation and approval require the founder; live provider controls and independent review remain prerequisites. Customer keys, vault plaintext and account passwords are outside this subsystem.
