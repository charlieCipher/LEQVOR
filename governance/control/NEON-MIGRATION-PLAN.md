# Governance migration approval scope — 16 October 2026

Target only: `leqvor-governance`, project `crimson-dust-50927470`, production
branch `br-curly-tooth-ao6663qp`, database `neondb`, AWS Singapore, PostgreSQL 18.6.
Live read-only inspection on this date: zero governance schemas, zero user tables,
zero customer schemas. Customer Supabase `awdsyhxdnyfilnzamflt` is excluded.

The proposed ordered batch is exactly:

1. `governance/migrations/001_founder_state.sql`: create private
   `founder_governance` schema, empty root/audit tables and append-only trigger.
2. `governance/migrations/002_execution_journal.sql`: create empty execution
   reservation/event tables with foreign keys, uniqueness and immutable triggers.
3. `governance/migrations/003_control_permissions.sql`: create three NOLOGIN
   control/executor/auditor roles, no elevated attributes/memberships; revoke
   PUBLIC connect/create/temp and schema/function privileges; grant only the
   documented table/column privileges. Control cannot enroll root state, erase
   audit or execute provider actions. Auditor cannot write. Executor can append
   journal records and reserve/lock entries, but cannot update/delete history.

No initial root row, keys, founders, session grants, customer data, LOGIN password,
service deployment or activation is included. The separate
`control/authorization-directory.sql` is NOT included and refuses this database.

The exact UTF-8/LF source commitments enforced by `neon-migration-batch.mjs` are:

| File | SHA-256 |
| --- | --- |
| 001 | `99ed96e0dee73dffdb75460ab8fc9a496f336de3c1b7756e411be84912ab507d` |
| 002 | `4e9cd5e6ab9dd321ca81313edf2ff69e106673a84e73534ca88c4bdbae2d24bd` |
| 003 | `c9e7b7b965405564f863fc2d0a58b158e630ea6208e56b47653c92fc5256fda2` |

Prepared batch: `.local-release/neon-governance-reviewed-scope-20261016.sql`.
After explicit user approval, the exact batch was applied as ONE transaction on
16 October 2026. UI read-back matched every nonblank source line; the editor added
only blank lines. Neon reported 41 successful statements including COMMIT. A new
READ ONLY query verified root/audit/reservations/execution rows all zero, customer
schemas zero, three safe NOLOGIN roles, and control unable to insert/delete/
truncate root state. Detailed role read-back showed all seven elevated/login/
inheritance flags false for all three roles. No passwords or runtime LOGIN grants
were included. Screenshot: `.local-release/neon-governance-migrations-applied-20261016.png`.

Pre-migration snapshot retained in Neon:
`production at 2026-10-16 11:59:25 UTC (manual)`, provider displays “Expires on:
never”. This used the available snapshot slot; the UI requires an upgrade for
additional snapshots/schedules. No upgrade was selected. History window is six
hours. A snapshot exists, but restoration has not been tested; it is not an
independent signed governance backup or a guarantee about provider-owner bypass.

## Apply and recovery procedure (requires approval)

- Capture current schema/role/ACL inventory and confirm no applications use the
  empty database. Review the effect of revoking PUBLIC database privileges.
- Obtain an independent provider recovery point/export before any write. Verify
  Neon plan retention; do not assume backup/restore guarantees from local tests.
- Execute all three scripts as ONE outer transaction, stripping only their
  outer BEGIN/COMMIT statements. Stop on error; never continue past a failed
  statement. An error before COMMIT rolls back the entire batch. Record actual
  PostgreSQL results; never automatically retry an ambiguous COMMIT.
- Re-read table/role/ACL inventory and verify all four tables are empty, all
  runtime roles remain NOLOGIN, and owner credentials are absent from Render.
- On ambiguous outcome, inspect schema/roles before deciding anything. If the
  empty batch committed but must be reversed, prefer restoring the verified
  isolated recovery point. A destructive schema/role rollback needs a separate
  approval and proof that all four tables remain empty and no dependents exist.
  Never drop populated history or use CASCADE as a recovery shortcut.
- Once data exists, recover forward from independently pinned signed archives;
  a provider point-in-time restore alone does not authorize governance rollback.

Local PGlite tests apply all three scripts and exercise actual SQL permissions
and append-only triggers. PGlite is not hosted Neon concurrency/restore proof.
Runtime SQL-created LOGIN credentials, connection acceptance, independently
protected policy pins and hosted concurrency tests remain subsequent gates.
