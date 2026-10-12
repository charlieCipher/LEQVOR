# Signed-history checkpoint recovery — local only

This follows item 7 of the remaining architecture plan. The deployment hold remains in force: no production migrations, hosted writes, Git push or deployment were performed. Existing layouts, controls and CSS are preserved.

## Implemented behavior

The existing timeline saves a public pending checkpoint before sending its signed review event. Storage must accept the write and return the exact value before upload proceeds. The pending journal contains only the preceding checkpoint and the proposed owner/sequence/hash; no private keys, signatures, tokens or vault plaintext are stored in it. Storage corruption or inability to retain a checkpoint blocks a new review instead of resetting history.

If a response is lost after the server commits, reopening the timeline verifies the entire signed chain against the proposed locally retained checkpoint. It also checks that the preceding checkpoint is the exact prefix of that chain. Only a matching chain promotes the proposal to the confirmed checkpoint. A crash between confirmation and journal removal is recoverable. Missing, altered, extended or unrelated history leaves the journal intact and blocks another review. The existing offline import control can replace a checkpoint only after explicit user submission and complete signed-chain verification; no server-provided head is adopted automatically.

Cold Lock and dialog unmount discard late responses before storage promotion. Switching accounts remounts the timeline state and loads the appropriate account checkpoint, so a previous account's anchor cannot leak into the new account's review.

## Boundaries and limitations

Browser storage read-back is best-effort retention, not a guarantee of disk durability. Browser storage is not independent of XSS, browser compromise or user clearing it. Keep the public checkpoint offline. The journal is not a backup and contains no information capable of unlocking a vault.

The server may commit before cancellation or a lost response. This feature detects a matching committed event; it does not promise transaction rollback. If a proposal was never committed or a concurrent stream differs, recovery fails closed. The user must explicitly verify an independently retained checkpoint using the existing import control. A single pending journal is not an atomic cross-tab mutex; concurrent tabs can still conflict. Those conflicts cannot be silently verified against a different hash, but manual reconciliation may be necessary. Server serialization remains the write boundary.

Only SECURITY_HISTORY_REVIEWED events are supported. This does not enroll trusted devices, enable general Shield, sign document revisions or audit every application operation. Those item-7 requirements remain unfinished. Hosted browser acceptance is deferred by the deployment hold.

## Validation

Real Web Crypto service tests exercise commit-then-lost-response recovery, unchanged public checkpoint shape, prior-prefix matching, absent/tampered/extended/foreign streams, storage failure before upload and Cold Lock during retention. Storage tests exercise silent dropped writes, quota failures, interrupted promotion, corruption and changed anchors. Existing-view tests exercise recovery, account changes and late-response suppression. See the remaining plan for broader acceptance requirements.

Validation passed: 298 regression tests across 72 files; all 19 focused history/service/storage/view tests; lint with zero warnings; production build and artifact checks. The stylesheet remains index-58SJVvnB.css. The existing main JavaScript bundle-size warning remains. These are local results, not hosted acceptance or an independent security review.
