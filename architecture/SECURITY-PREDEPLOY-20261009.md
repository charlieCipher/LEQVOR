# Local security increment — deployment hold

The user instructed: “Continue, and stop before deployment.” This increment stays local. Do not apply production SQL, run hosted write tests or push main (which triggers Vercel) without a later explicit deployment instruction. A future “continue” keeps this hold in effect.

## Implemented locally

- `20261009_record_sharing_conflicts.sql` changes deterministic stale-revision failures in update/delete/invite RPCs from 40001 to PT409. It requires exactly one expected error-code occurrence in each function and checks that function owner, ACL, security-definer flag and configuration remain unchanged. The entire migration rolls back if a guard fails. No new grants, policies, recipients or plaintext columns are introduced.
- The client recognizes both error codes and displays a sanitized reload instruction. Existing installations remain compatible; local backend validation expects PT409 after the new migration. The earlier historical migrations/tests retain their original behavior; the runner separately checks the final corrected schema.
- The signed-history API uses one 15-second network deadline across account validation, signer retrieval and privileged writes. Caller cancellation is preserved and its bearer headers are not forwarded as writer defaults. Expiration prevents a later write from starting. A timed-out write does not produce a success claim. Cancellation cannot guarantee that an in-flight database transaction did not commit; the retained-checkpoint reconciliation limitation remains explicit.
- Unused legacy Shield/device/session helpers no longer manufacture “Safe,” “Shield active,” two trusted devices or a trusted current device. They report unavailable. These helpers are not used by the current page UI, so this does not redesign any page or enable device/Shield functionality.

Supabase documents the 40001 retry issue at https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b . The previous history rollout reproduced it on the hosted backend. This increment prepares the same correction for the remaining three business-conflict branches; hosted verification of this local increment is intentionally deferred.

## Next trusted-device boundary

Verified device enrollment must not reuse a synced account passkey, browser fingerprint, local storage flag or account-signed history event as proof of a distinct device. It needs a separate signing identity, an owner/vault/session-bound expiring challenge, fresh account authentication/MFA, proof of possession and atomic one-use challenge consumption. A registered signing device must not imply automatic VMK unlock. Local key storage and any optional encrypted device wrapper need explicit custody/lifecycle design and review; the server must never receive a plaintext VMK or device private key. Revocation must be checked at use time, cancel pending actions and require reauthentication. This increment does not implement or claim this enrollment protocol.

## Next Shield boundary

General Shield must enforce action-specific approvals at the backend operation itself, not only in a React checkbox or an approval service disconnected from export/recovery/share writes. Approvals must bind an exact canonical action, target/revision, owner, distinct accepted approvers, policy version, expiry and nonce. Each approval needs a separately verified signature; execution must atomically consume the authorization and recheck current policy, revocation, expiry and owner reauthentication. Existing manual-review invitations authorize selected records only. No automatic legal, death or incapacity determinations are introduced. General Shield remains unfinished.

## Release gate

Local validation completed: full regression run passed 285 tests across 70 files; the subsequently added atomic migration-rollback test passed separately. Focused conflict/provider/adapter/deadline checks passed 17 tests. All PostgreSQL schema, ownership, MFA, isolation, immutable-state and conflict checks passed. Encrypted restore/recovery and restored cross-account isolation passed. Lint, build, artifact exclusions and release configuration passed; dependency audit found zero vulnerabilities. The stylesheet remains index-58SJVvnB.css. The existing large-main-bundle warning remains. No cloud writes, production SQL, Git push or deployment were performed for this increment.

After explicit authorization, verify the production function baseline, apply this error-code-only migration, release the matching client/API, then run disposable hosted stale-save/delete/invite, isolation and deadline tests. Do not infer cloud acceptance from the disposable PostgreSQL engine or mocked network tests. Preserve the existing UI stylesheet. Backups still require a separate destination; real authenticator/device acceptance and independent review remain separate work.
