# Neon governance privilege and integrity review — 16 October 2026

**Outcome: the current service-role grants match the intended matrix, but the
end-to-end protection against privileged database history rewriting is NOT
complete. Do not activate Founder Authority.**

This was a read-only live review plus disposable local PostgreSQL tests. No
production role switches, role elevation, grants, migrations, data writes,
deployment, customer Supabase changes, push or merge occurred during this review.
Only review SQL, this report and characterization tests were added locally.
Existing unrelated implementation work was preserved. Key C remains pending;
the 2-of-3 policy and 72-hour cooling requirement were not changed.

## Live evidence and scope

Target: **leqvor-governance**, Neon project **crimson-dust-50927470**, production
branch **br-curly-tooth-ao6663qp**, **neondb**, AWS Singapore. The SQL session was
`neondb_owner`, PostgreSQL **18.6 (653b019)**. Both audit batches explicitly used
`BEGIN READ ONLY`, a 15-second local statement timeout, SELECTs and COMMIT. Both
completed all four statements successfully; `transaction_read_only` was `on`.

Reproducible queries:

- `NEON-PRIVILEGE-AUDIT-20261016.sql`: memberships, role flags, ownership, schema /
  database / relation / column ACLs, sequences, defaults, functions, triggers,
  constraints, role settings and row counts.
- `NEON-PRIVILEGE-DETAIL-20261016.sql`: effective table/column privileges including
  PostgreSQL 18 MAINTAIN, grant options, elevated parameter access, function body,
  catalog SECURITY DEFINER functions and effective future function defaults.

Exact exported metadata (Git-ignored, no credentials):
`.local-release/neon-privilege-catalog-20261016.json` and
`.local-release/neon-privilege-detail-20261016.json`.

All four tables have **zero rows**. Customer schemas `auth`, `storage` and
`supabase_functions`: **zero**. This verifies the inspected database is separate
from the customer Supabase schema, not that all possible infrastructure/network
or provider identities have been independently audited.

## Effective permission matrix

| Role | root_state | audit_events | execution_reservations | execution_events |
| --- | --- | --- | --- | --- |
| control | SELECT; UPDATE(document) only | SELECT, INSERT | none | none |
| executor | SELECT | SELECT | SELECT, INSERT; UPDATE(execution_key) only | SELECT, INSERT |
| auditor | SELECT | SELECT | SELECT | SELECT |

For all three roles on all four tables: no table-wide UPDATE, DELETE, TRUNCATE,
REFERENCES, TRIGGER or MAINTAIN. The two column UPDATE grants have **no grant
option**. No table privileges have grant option. No other column UPDATE rights
exist. The executor column UPDATE permission supports `SELECT ... FOR UPDATE`;
the enabled statement trigger rejects actual UPDATE, including a no-op.

`information_schema.role_table_grants` alone misses the two column grants and
does not establish effective membership, ownership or a cryptographic boundary.

### Roles and memberships

- All three service roles: **NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
  NOINHERIT, NOREPLICATION, NOBYPASSRLS**. None owns a relation, schema or function.
- They have **no outgoing role memberships**, including no transitive membership
  in privileged roles. No other role inherits or can SET into them in the
  inspected membership graph.
- Neon created incoming grants to `neondb_owner` for all three roles:
  **ADMIN TRUE, INHERIT FALSE, SET FALSE**, grantor `cloud_admin`. These let the
  owner administer the roles, but do not let the service roles become owner.
  They also explain why the earlier owner `SET ROLE` probe could not be used;
  this review did not change memberships to make that probe pass.
- `neondb_owner`: LOGIN, INHERIT, CREATEDB, CREATEROLE, REPLICATION and BYPASSRLS;
  not a PostgreSQL superuser. It inherits `neon_superuser` and, transitively,
  broad read/write/monitoring and provider-managed roles. It owns the database,
  governance schema, four tables, indexes and trigger function. It can administer
  its objects and role grants. It is unsuitable as a runtime credential.

### Schema, database, sequence and PUBLIC permissions

- Service roles have database CONNECT only: **no CREATE or TEMP**.
- They have USAGE, **no CREATE**, on `founder_governance`; **neither USAGE nor
  CREATE** on `public`. `public` is owned by `pg_database_owner` and grants that
  owner USAGE/CREATE. Governance schema owner is `neondb_owner`.
- Current database, both application schemas, four tables, two column grants
  and current application function have **no PUBLIC grants**.
- **No user sequences exist**, including no governance identity/serial sequence.
  SQL `sequence` columns are ordinary integers, not sequence objects. There is
  currently no sequence privilege path to exploit.
- Service search paths are `pg_catalog, founder_governance`; auditor additionally
  defaults to read-only transactions. That default is not a security barrier by
  itself; actual SELECT-only ACLs are the relevant restriction.
- No RLS policies or enabled RLS: expected for these singleton service tables,
  but not protection against the owner. No rewrite rules were present.
- Service roles cannot SET or ALTER SYSTEM for `session_replication_role` or
  `allow_system_table_mods`.

### Privileged functions and triggers

Only one non-system function exists:
`founder_governance.reject_audit_mutation()`.

It is **SECURITY INVOKER**, owned by `neondb_owner`, has fixed
`search_path=pg_catalog`, and its body only raises the append-only exception.
None of the service roles has direct EXECUTE permission. Triggers execute it
under PostgreSQL trigger semantics despite those direct EXECUTE revocations.
No SECURITY DEFINER functions were found in application schemas or pg_catalog.
Ordinary PostgreSQL built-ins remain available under their normal built-in
authorization checks; this does not mean PUBLIC has no privileges anywhere in
the system catalogs.

The three append-only statement triggers are enabled (`O`) on `audit_events`,
`execution_reservations` and `execution_events`, covering UPDATE/DELETE/TRUNCATE.
There is **no root_state mutation trigger or signature-verifying SQL function**.
All existing constraints are validated: singleton/object shape, positive sequence,
hash text shape, primary/unique keys, and journal foreign key. They do not verify
signature validity, JSON event hashes, consecutive history or state transitions.

## Findings and corrective actions

### F1 — High: an independent history head is not mandatory on the server

`governance/gateway.mjs:20` / `:26` / `:29` forwards `packet.checkpoint` to the
engine. `engine.mjs:21` validates a separately configured **policy hash**, but
compares state/history to that caller-supplied checkpoint. It does not obtain the
latest head from an independent witness or verify a signed checkpoint packet.
`control/runtime.mjs:20` wires only the policy pin; the configured console
checkpoint initializes public console state, not a mandatory server-side fence.

Local reproduction first created a valid freeze with a real disposable founder
signature. After changing only `state.frozen` to false, the unchanged retained
checkpoint rejected it, but a recalculated caller checkpoint made `snapshot()`
accept it. The freeze event remained in the valid hash chain: the engine does
not reconstruct the complete materialized state from history. A hash chain and
policy pin alone therefore do not prove an independently anchored current state.

This is NOT evidence that an unauthenticated website visitor can write the DB,
forge founder signatures or execute a provider transfer. Auth0, roles, fresh MFA,
root signatures and independent provider execution checks are separate layers.
It is evidence that the requested database-admin tamper-resistance claim cannot
currently be made. A database-only attacker still cannot create founder private
keys; an honest client retaining its old head can detect the changed state.

**Required:** use an independently protected, authenticated latest-head witness,
monotonic advancement / compare-and-swap and explicit rollback/fork/freshness
checks on server reads, mutations and the execution fence. Never allow request
data or the same mutable database to replace that anchor. Fail closed when the
witness is unavailable or divergent. Establish independently retained signed
checkpoints, monitored read-back and restore evidence. Periodic checkpoints alone
leave an unanchored interval; document and fence it before executing effects.
Validate materialized state against authorized transitions, not just self-hashes.

### F2 — High trust boundary: the owner can bypass SQL immutability

The actual owner can disable/drop/replace its user triggers, rewrite tables,
replace functions or change grants. Local PostgreSQL reproduction showed DELETE
rejected by the audit trigger, then succeeding after the owner disabled that
trigger. No such operation was attempted against Neon. RLS, a NOLOGIN object
owner or a trigger cannot make data immutable against the provider's privileged
database administration. Moving ownership can reduce routine credential risk,
but cannot remove this fundamental administrative capability.

**Required:** keep owner credentials out of every runtime; separately control
migration/admin access and monitor DDL/grant changes. Independently retained,
signed, monotonic checkpoints and independently fenced provider actions must
detect/prevent acceptance of rewritten history. Audit both root history and the
**execution journal**: the root archive explicitly excludes the execution journal.
Independent cloud retention, custody and live restore have not been demonstrated.
Do not describe the DB hash chain as externally immutable or silently
admin-proof. The database owner can always destroy availability.

### F3 — Medium: future functions still default to PUBLIC EXECUTE

Live `pg_default_acl` contains no global function-default restriction for
`neondb_owner`. Effective `acldefault('f', owner)` reports PUBLIC EXECUTE **true**.
Migration 003 uses a schema-scoped REVOKE, which cannot remove a global default.
The current trigger function is explicitly revoked and is not exposed, but a
future function in the USAGE-accessible governance schema can accidentally be
callable by all service roles, including an unsafe SECURITY DEFINER function.

**Proposed SQL, NOT applied:**

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Repeat for each explicitly approved future object-creator role. Review existing
function ACLs separately; defaults are not retroactive. Grant EXECUTE only on
reviewed functions to exact intended roles. Do not rerun the existing batch.
The local reproduction showed a newly created function PUBLIC-executable before
this global correction and non-executable afterward.

PostgreSQL documents this exact schema/global limitation:
https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html

### F4 — Medium: root JSON mutation is authorized in application code, not SQL

Normal path: Auth0 signature/MFA + live session/role checks → gateway → engine
policy/checkpoint/audit and request/quorum/cooling checks →
`PostgresGovernanceStore` locks singleton row FOR UPDATE, checks duplicated JSON
history, appends new events and updates document in one DB transaction.

The control role has direct UPDATE(document); a holder of that database identity
can bypass the engine and replace an existing document with any JSON object,
including `{}`. The SQL constraints accept that. Control can also append
syntactically shaped but unauthenticated audit rows, causing inconsistency/DoS.
Executor INSERT permissions similarly do not validate signed journal contents.
These are deliberate service permissions, not an unexpected extra grant; they
must not be mistaken for DB-enforced 2-of-3 authorization.

**Required:** protect runtime identities, enforce F1 independently, add complete
transition/state checks and consider a reviewed narrow mutation interface with
separate ownership and fixed search_path. A SECURITY DEFINER wrapper alone is
not sufficient: if it accepts arbitrary JSON it preserves the same bypass, and
the provider owner can still replace it. Any grant/interface change requires a
new reviewed migration and approval. While root_state is empty, control cannot
insert/enroll it at all; the present database remains inactive.

### F5 — Medium: duplicated audit SQL fields are not checked on load

`postgres-store.mjs:10` reads only `document ORDER BY sequence`. It checks the JSON
documents against `root_state.audit`, not SQL sequence/event_hash against the
JSON event fields. Shape/unique constraints do not establish hash equality or
consecutiveness. The local store accepted matching JSON stored at sequence 7
with an unrelated 64-character hash. This test isolates storage; the engine has
additional JSON history verification. A row with valid event JSON but incorrect
duplicated SQL fields can likewise evade that particular storage comparison.

**Required:** load sequence, event_hash and document; require ordinal continuity
and exact correspondence to the event's sequence/event_hash and canonical hash.
Check append/update affected-row counts and enforce atomic binding between the
new root document and audit append. Add malformed-column, gap, duplicate,
concurrency and rollback tests. Such checks strengthen integrity, but cannot
replace independent anchoring against an owner who changes both copies.

### F6 — Medium: runtime preflight does not cover this complete audit

`control/neon-database.mjs:15` checks selected role flags/memberships/ownership,
DDL rights and table/column rights. It does not inspect callable definer
functions, future PUBLIC defaults, trigger bodies/enabled state, constraints,
sequence privileges, privilege grant options or MAINTAIN. Current live values
for these extra checks are restricted as reported above, except F3.

Local test introduced a harmless PUBLIC-executable SECURITY DEFINER function;
the existing startup verifier still passed. This is drift-detection coverage
missing from preflight, not a dangerous function found in production.

**Required:** extend fail-closed preflight/continuous monitoring to a versioned
allowlist of these surfaces; include negative drift tests. Independent execution
enforcement must also validate current authoritative state and provider receipts.

## Tests and limits

- Two live read-only audit batches succeeded, with effective privileges measured
  by explicit role arguments. No service-role LOGIN acceptance was possible:
  all three remain NOLOGIN; no credentials or role elevation were provisioned.
- Targeted PostgreSQL permission, atomic-batch, audit, root archive and execution
  archive suite: **5 files, 18 tests passed** (65.25 seconds).
- Final updated characterization file: **4 tests passed** (23.29 seconds):
  future function defaults / startup definer blind spot; direct control JSON
  writes / owner trigger bypass; real freeze then forged checkpoint acceptance;
  unchecked duplicated SQL audit fields. All mutations used disposable local
  PGlite databases or in-memory test state; no production key C was created.
- ESLint on the final characterization file: exit 0, zero warnings.
- Earlier full regression completed **95 files, 405 tests passed**, before these
  review-only additions. It is not a new 409-test full-suite claim.
- Passing characterization tests demonstrate the current gaps. They are not
  evidence that the findings have been fixed. Runtime implementation and
  production grants were deliberately not changed by this review.
- Existing archive tests verify two distinct signatures, pinned policy and
  retained parent/digest, and reject tampering/replay/forks locally. They do not
  establish deployed independent custody, cloud retention, current-head freshness
  or real cloud restore. This remains self-review, not an independent audit.

Production SQL corrections, runtime behavior changes and live witness/retention
provisioning require separate reviewed work and approval where applicable.
Founder Authority must remain inactive until these integrity gates and the
existing hardware, Key C, independent custody and deployment requirements pass.
