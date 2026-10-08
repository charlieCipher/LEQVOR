# Selected sharing — 9 October 2026

Prepared migrations: `20261009_selected_sharing.sql` and `20261009_shared_files.sql`. Neither applied to production yet. Do not deploy a live-sharing entry point before the migrations are authorized and applied. User instruction: preserve the current UI. The proposed standalone sharing panel was removed before deployment; existing visual design remains unchanged. Frontend behavior is provided by the markup-free `useSharingController`.

## Implemented increment

- The owner selects one record and a contact with an independently confirmed encrypted recipient binding. The client wraps only that record's DEK for the pinned recipient public key. The VMK is never shared.
- The database checks the exact registered recipient key and expected source revision, then stores an encrypted snapshot of that revision. It omits the owner's wrapped DEK from recipient responses.
- Invitations are in-app, pending until accepted by that recipient. No email is sent. They expire after 30 days. Only the owner can revoke a pending/active share. Revocation/expiry prevent further server retrieval; they cannot erase copies already obtained.
- Inviting, accepting and revoking require authentication within five minutes. Accounts with verified MFA factors require AAL2. Existing Share Record and Review Permissions dialogs now use the existing password/MFA reauthentication flow. Missing assurance fails closed.
- Original vault/record/file/people/graph/history tables retain owner-only policies. Recipient access is solely through the narrowly scoped read RPC. Pending, expired, revoked and unrelated accounts cannot read a snapshot.
- Shared content requires explicit local reveal; focus loss, backgrounding, closing and a 30-second timeout clear active revealed state. Async results arriving after focus loss are discarded.
- Source edits never silently widen or refresh access. Share a new revision explicitly when needed. The owner has a maximum of 100 outstanding invitations/shares. The panel lists up to 100, prioritizing outstanding shares.

## Scope still open

The second migration atomically saves up to 20 explicitly selected attachment wrappers with the invitation. Invalid, unrelated or duplicate selections roll back the entire invitation. File snapshots omit the owner's wrapped file key; direct key-table, owner file-table and storage access remain unavailable to recipients. The client service wraps each independent file key and decrypts downloads locally. Linked records are not automatically shared.

The new `/api/shared-file` POST endpoint checks the ordinary authenticated recipient's active grant before accessing private storage with server credentials. It returns only a validated ciphertext envelope, never a signed URL or a key. It repeats authorization after storage retrieval to reject revocation in flight and sets no-store headers. Wrapped keys and encrypted filenames are fetched separately through the narrow recipient RPC. Hosted encrypted objects above 4,000,000 bytes are refused to stay below function response limits; a streaming solution for larger shared files remains open. Owner-only downloads retain their existing limit.

The existing Share Record form now sends one reviewed record invitation to a confirmed recipient after account/MFA verification. Choosing multiple records disables submission, avoiding a partially successful multi-record operation. Preview plans remain preview-only. The existing Review Permissions dialog loads metadata, accepts recipient invitations and revokes owner grants after verification. Accepted recipients explicitly reveal the saved encrypted payload in existing setting rows; timeout, focus loss and Cold Lock clear active disclosure. Incoming structured payload fields are shown as factual text, with bounded depth/field counts. A changed account/service cannot retain the prior account's selected action or revealed content.

Explicit file selection and recipient download controls remain pending; invitations sent from this frontend currently exclude attachments and say so. No new standalone panel, CSS, layout, color or typography changes are included. Emergency, date, incapacity and death activation remain disabled until the trigger/verification work. Signed grant history and backup preservation of sharing identities/grants remain later increments.

Independent recipient confirmation pins a key/account identifier; it does not establish legal identity or professional authority. No public recipient directory is exposed. Server authorization is still part of the trust model; these grants are not digitally signed proof of sender identity.

## Validation and rollout

Disposable PostgreSQL tests cover missing/stale authentication, MFA downgrade/missing assurance, stale record revisions, key substitution, pending/unrelated access, sender acceptance, replay acceptance, direct-table isolation, absent VMK wrapper, expiry and revocation. Real crypto/component tests cover recipient decryption, key/identity substitution rejection, Cold Lock, explicit reveal and focus-loss cleanup.

Hosted two-account runner is prepared, not run before migration application:

```powershell
node --env-file=.env.local scripts/test-hosted-disposable-accounts.mjs --run-hosted-test --sharing
```

It provisions disposable accounts, uses ordinary authenticated clients for invitations/access/revocation and local decryption, then removes only generated accounts/identities/records/files. It exercises the download helper against hosted Auth, RPC and storage with server credentials, not the deployed HTTP endpoint. Deployed endpoint/browser acceptance must be checked separately. It does not test real signup email delivery or a physical device.

Validation result: all 228 regression tests across 54 files passed. New frontend tests verify review-before-invite, confirmed-recipient selection, reauthentication failure, multi-record rejection, disabled emergency activation, verified acceptance/revocation, explicit reveal, focus-loss hiding, expiration and account-change cleanup. Earlier tests cover recipient attachment decryption, proxy authorization ordering, wrong-path/key denial, malformed requests, in-flight revocation, plaintext/oversized object rejection and sanitized failures. All PostgreSQL suites passed, including atomic file/grant rollback, unselected-file denial, pending/unrelated/expired/revoked recipients, direct key-table denial and deleted-file key cascade. Lint and production build checks passed; the preceding attachment increment also passed encrypted restore. Build retains its existing bundle-size warning. Workspace changes are limited to wiring the existing dialogs; no CSS, typography, layout or standalone panel changes are included.

Production read-only readiness query confirmed both sharing RPCs are absent. Both migrations are staged in the Supabase SQL Editor for action-time approval, not executed. Evidence: `docs/sharing-migration-review.png`. No production sharing permissions have been changed, and the hosted sharing runner has not yet been executed.
