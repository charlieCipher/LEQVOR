# Selected sharing — 9 October 2026

Prepared migration: `20261009_selected_sharing.sql`. Not applied to production yet. Do not deploy the matching frontend before the migration is authorized and applied.

## Implemented increment

- The owner selects one record and a contact with an independently confirmed encrypted recipient binding. The client wraps only that record's DEK for the pinned recipient public key. The VMK is never shared.
- The database checks the exact registered recipient key and expected source revision, then stores an encrypted snapshot of that revision. It omits the owner's wrapped DEK from recipient responses.
- Invitations are in-app, pending until accepted by that recipient. No email is sent. They expire after 30 days. Only the owner can revoke a pending/active share. Revocation/expiry prevent further server retrieval; they cannot erase copies already obtained.
- Inviting, accepting and revoking require authentication within five minutes. Accounts with verified MFA factors require AAL2. The UI uses the existing password/MFA reauthentication flow. Missing assurance fails closed.
- Original vault/record/file/people/graph/history tables retain owner-only policies. Recipient access is solely through the narrowly scoped read RPC. Pending, expired, revoked and unrelated accounts cannot read a snapshot.
- Shared content requires explicit local reveal; focus loss, backgrounding, closing and a 30-second timeout clear active revealed state. Async results arriving after focus loss are discarded.
- Source edits never silently widen or refresh access. Share a new revision explicitly when needed. The owner has a maximum of 100 outstanding invitations/shares. The panel lists up to 100, prioritizing outstanding shares.

## Scope still open

Attachments are NOT shared by this increment; their independent file DEKs require separate recipient wrappers. Linked records are also not shared. The UI explicitly states both exclusions. Emergency, date, incapacity and death activation remain disabled until the trigger/verification work. Signed grant history and backup preservation of sharing identities/grants remain later increments. Structured role details are encrypted in the shared payload, but this first recipient view renders the common continuity fields only.

Independent recipient confirmation pins a key/account identifier; it does not establish legal identity or professional authority. No public recipient directory is exposed. Server authorization is still part of the trust model; these grants are not digitally signed proof of sender identity.

## Validation and rollout

Disposable PostgreSQL tests cover missing/stale authentication, MFA downgrade/missing assurance, stale record revisions, key substitution, pending/unrelated access, sender acceptance, replay acceptance, direct-table isolation, absent VMK wrapper, expiry and revocation. Real crypto/component tests cover recipient decryption, key/identity substitution rejection, Cold Lock, explicit reveal and focus-loss cleanup.

Hosted two-account runner is prepared, not run before migration application:

```powershell
node --env-file=.env.local scripts/test-hosted-disposable-accounts.mjs --run-hosted-test --sharing
```

It provisions disposable accounts, uses ordinary authenticated clients for invitations/access/revocation and local decryption, then removes only generated accounts/identities/records. It does not test real signup email delivery or a physical device.

Validation result: all PostgreSQL suites passed, including the new sharing permission tests. The regression run passed 212 tests and found one stale People-label expectation; that expectation was corrected and the affected People/sharing tests passed. Lint, encrypted restore and production build passed. Build retains its existing bundle-size warning. No production sharing permissions have been changed, and the hosted sharing runner has not yet been executed.
