# Selected sharing — 9 October 2026

Prepared migration: `20261009_selected_sharing.sql`. Not applied to production yet. Do not deploy a live-sharing entry point before the migration is authorized and applied. User instruction: preserve the current UI. The proposed standalone sharing panel was removed before deployment; existing visual design remains unchanged. Frontend behavior is provided by the markup-free `useSharingController`.

## Implemented increment

- The owner selects one record and a contact with an independently confirmed encrypted recipient binding. The client wraps only that record's DEK for the pinned recipient public key. The VMK is never shared.
- The database checks the exact registered recipient key and expected source revision, then stores an encrypted snapshot of that revision. It omits the owner's wrapped DEK from recipient responses.
- Invitations are in-app, pending until accepted by that recipient. No email is sent. They expire after 30 days. Only the owner can revoke a pending/active share. Revocation/expiry prevent further server retrieval; they cannot erase copies already obtained.
- Inviting, accepting and revoking require authentication within five minutes. Accounts with verified MFA factors require AAL2. Existing-view wiring must use the existing password/MFA reauthentication flow. Missing assurance fails closed.
- Original vault/record/file/people/graph/history tables retain owner-only policies. Recipient access is solely through the narrowly scoped read RPC. Pending, expired, revoked and unrelated accounts cannot read a snapshot.
- Shared content requires explicit local reveal; focus loss, backgrounding, closing and a 30-second timeout clear active revealed state. Async results arriving after focus loss are discarded.
- Source edits never silently widen or refresh access. Share a new revision explicitly when needed. The owner has a maximum of 100 outstanding invitations/shares. The panel lists up to 100, prioritizing outstanding shares.

## Scope still open

Attachments are NOT shared by the prepared database migration. Independent attachment-key wrapper/decryption primitives now bind each file key to grant, record, file and recipient IDs; tampering/substitution tests pass. Persistence and authorized encrypted download still need implementation before attachment sharing can be enabled. Linked records are also not shared. Existing-view wiring must disclose both exclusions using existing status/error areas. Emergency, date, incapacity and death activation remain disabled until the trigger/verification work. Signed grant history and backup preservation of sharing identities/grants remain later increments. Structured role details are encrypted in the shared payload; the recipient view still needs wiring without redesign.

Independent recipient confirmation pins a key/account identifier; it does not establish legal identity or professional authority. No public recipient directory is exposed. Server authorization is still part of the trust model; these grants are not digitally signed proof of sender identity.

## Validation and rollout

Disposable PostgreSQL tests cover missing/stale authentication, MFA downgrade/missing assurance, stale record revisions, key substitution, pending/unrelated access, sender acceptance, replay acceptance, direct-table isolation, absent VMK wrapper, expiry and revocation. Real crypto/component tests cover recipient decryption, key/identity substitution rejection, Cold Lock, explicit reveal and focus-loss cleanup.

Hosted two-account runner is prepared, not run before migration application:

```powershell
node --env-file=.env.local scripts/test-hosted-disposable-accounts.mjs --run-hosted-test --sharing
```

It provisions disposable accounts, uses ordinary authenticated clients for invitations/access/revocation and local decryption, then removes only generated accounts/identities/records. It does not test real signup email delivery or a physical device.

Validation result: all 215 regression tests across 52 files passed after removing the proposed panel and adding behavior-only/file-crypto tests. All PostgreSQL suites passed, including extra-field rejection, direct-grant-write denial and the outstanding-invitation limit. Lint, encrypted restore and production build passed. Build retains its existing bundle-size warning. Workspace JSX matches the deployed `15581fc` baseline; no CSS, typography, layout or new-panel changes are included. No production sharing permissions have been changed, and the hosted sharing runner has not yet been executed.
