# Record transactions and cleanup

`20260913_record_transactions.sql` is applied to the production project alongside the V5 foundation. The ciphertext-envelope migration is also applied and validated as of 28 September; see `PRODUCTION-VALIDATION-2026-09-28.md`. Worker scheduling remains pending.

Updates and deletions require the revision read with the record. SQL locks the owned row and rejects a stale revision with SQLSTATE 40001. Direct authenticated UPDATE/DELETE privileges are removed so callers cannot bypass the version check. Cross-owner calls receive an authorization failure. Updates generate the timestamp and increment revision on the server.

Deleting a record cascades through attachment metadata and grants. Each deleted attachment queues its opaque path in the same transaction. The browser never deletes the object first. Queue entries survive deletion of their original record/account.

Run `node scripts/ciphertext-cleanup.mjs` in a trusted server environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` supplied by the server secret manager. Never use a VITE-prefixed variable or ship the service credential to the browser. The worker processes up to 50 jobs, removes ciphertext through the storage API, and acknowledges only successful removals. Failures stay queued. Schedule it on server infrastructure; no schedule has been deployed locally.

The old isolation SQL predates revocation of direct record UPDATE/DELETE privileges: those operations should now fail with insufficient_privilege instead of returning zero affected rows. Run the transaction scenarios as well as storage and account tests in staging. Unit tests of the worker do not verify PostgreSQL behavior.

Remaining limits: upload-crash orphan reconciliation, consistent snapshot exports, grant version rotation, and independent signed history still require work. Server-side envelope constraints are now applied and validated. Requests already dispatched before Cold Lock may complete; client state guards do not cancel database transactions.
