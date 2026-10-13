# LEQVOR protected execution: local implementation and remaining work

13 October 2026. **Not deployed, configured or activated.** No customer routes/UI/passwords, production permissions or provider ownership changed.

## Implemented locally

- `control/admission.mjs`: bounded process-local peer token buckets. Uses only the actual transport peer, ignores caller forwarding headers, clamps backward clock movement and denies new peers when its bounded table is full. Supply explicitly to the control server. Multi-instance/proxy deployments still require a reviewed distributed policy, concurrency/body admission and load testing.
- `pool-database.mjs`: standard node-postgres Pool transaction adapter. All statements use one checked-out connection, with local statement/lock/idle limits, rollback and connection release. Commit-response loss becomes `TransactionOutcomeUnknown`; it is never retried. No pool, connection string, credentials or listener is created. This follows the [node-postgres transaction contract](https://node-postgres.com/features/transactions).
- `migrations/002_execution_journal.sql`: reservation by unique request ID and stable provider idempotency key; immutable reservation/event tables with no public grants. This is for the separate protected governance database only. It has not been applied to production or the customer database. The database owner can still disable its own triggers.
- `execution-journal.mjs`: atomic one-use reservation and hash-linked append history. Records attempted, uncertain, not-dispatched and verified provider outcomes; terminal outcomes cannot be rewritten through the adapter. Concurrent duplicate calls cannot both claim a dispatch. Unknown attempts are not automatically retried or discarded after lease expiry.
- `executor.mjs`: re-verifies full live root authorization before reservation and again before dispatch. Requires an explicitly registered independently fenced provider adapter. Provider waits have a bounded timeout/AbortSignal; timeout and unverifiable/lost responses mean `OUTCOME_UNKNOWN`, never proof of non-execution. Explicit reconciliation calls only the read-only receipt lookup, even after expiry/freeze. Receipt action, target, idempotency, timestamps and evidence digest must match, and the provider adapter must independently verify provenance. Cached terminal receipts are reverified before they are reported.

No provider adapter is supplied. There is no HTTP execute route, automatic worker, secret lookup or override. No founder private key enters this implementation. There is no claim of atomic execution across PostgreSQL and an external provider.

## Provider contract still requiring hard engineering

A reviewed adapter for a specific action must implement:

```text
enforcement: "independent-live-root-fence-v1"
execute({ intent, target, signal })
lookupReceipt({ intent, target, signal })  // observation only
verifyReceipt({ intent, target, receipt, signal })
```

The enforcement string is a required **contract marker, not evidence that enforcement works**. The real integration must be independently tested. It must:

1. Validate the complete action-specific public target schema and actual provider resource/owner/build identifiers.
2. Verify live independent policy/anchor, exact root signatures, version, expiry, cooling and freeze **at the point of the provider effect**, not merely when a queue item was read. A preflight here cannot close the final race in a different system.
3. Enforce the stable idempotency key and prevent bypass via ordinary Vercel/GitHub/Supabase/account credentials or mutable deployment code. Account-owner access to those controls must be protected separately. Do not put unrestricted provider owner credentials in this service and call that independent enforcement.
4. Persist/return independently verifiable evidence of the actual operation. A response status, asserted JSON receipt or the absence of a receipt is insufficient. `NOT_APPLIED` requires authoritative proof of non-execution, not a timeout/404.
5. Bound calls and honor AbortSignal while recognizing that remote effects may continue after abort. Reconciliation must never execute/retry the operation. Crash recovery must preserve ambiguous reservations and verify authoritative receipts.
6. Integrate the execution journal and verified evidence into externally retained checkpoints. The current root-state checkpoint covers governance state/audit, **not this separate execution history**; do not use it to claim external anchoring of execution events.

Only then can actual deployment/promotion, ownership/infrastructure transfer, policy/key rotation, root secret changes and provider-enforced freeze be considered connected. The root state remains `AUTHORIZED`; a journal `APPLIED` record does not itself update provider configuration or the root policy. Those action-specific transitions and reviewed receipts still need integration.

## Validation and failure handling

Eight new tests cover peer admission and same-connection transactions, plus real isolated PostgreSQL reservations/history with synthetic signed two-phase root authorizations and simulated provider adapters. They cover concurrency, append-only controls, lost responses, replay prevention, pre-dispatch freeze, receipt substitution, timeout/abort and observation after expiry. No live provider, founder hardware or production database was used.

The full regression suite passed 360 tests across 85 files; six separate control-service acceptance tests, lint and customer build/artifact checks passed. The customer JS/CSS asset hashes are unchanged. This is software validation, not production founder protection.

```powershell
npx vitest run tests/founder-infrastructure.test.js tests/founder-executor.test.js
```

If a journal write/commit response is lost after a provider call, do not rerun execution. Read the durable journal and explicitly reconcile using authoritative provider evidence. A reserved operation without a verified outcome remains uncertain. Rejection before dispatch is recorded separately; it still consumes that execution reservation. A new attempt needs a new reviewed root authorization.

The local safeguards are useful, but hardware attestation/enrollment, native release signing, provider identity/control configuration, external storage/restore, lost-device recovery and independent review remain activation blockers.
