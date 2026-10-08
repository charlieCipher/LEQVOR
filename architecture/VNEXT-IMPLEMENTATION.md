# LEQVOR vNext implementation

The user-supplied `LEQVOR-VNEXT-SPECIFICATION.txt` is the target specification as of 8 October 2026. Existing client encryption and owner isolation remain mandatory.

## First increment: relational continuity graph

Prepared migration: `supabase/migrations/20261008_continuity_graph.sql`. Applied to production on 8 October 2026, together with the asset-workflow migration.

- `continuity_entities` indexes existing records and trusted people; it does not copy their plaintext or create a second person directory. Source IDs are stable node IDs. Type is explicit: PERSON, ASSET, DOCUMENT, POLICY, INSTRUCTION, OTHER.
- `continuity_edges` stores individually encrypted relationships with independent DEKs wrapped by the VMK. Composite foreign keys ensure both endpoints belong to the same vault and owner. Deleted source records remove their graph index and incident edges, not the other source records.
- Owner-only restrictive RLS applies to both new tables. Authenticated clients can read, insert and delete their own graph entries. In-place updates are disabled. No recipient read policy or record grant is added.
- The existing V5 vault service exposes a separate `graph` service. It registers source entities, creates validated relationships and decrypts the graph on the active client. React does not call Supabase directly.
- Client validation restricts relationship directions and uses integer basis points for an individual allocation. Aggregate allocations, nomination evidence/status and structured document state are validated by the asset workflow described below.
- Relationship meaning, notes and allocation are encrypted. Both endpoint IDs are duplicated inside authenticated ciphertext, so changing the visible topology without changing ciphertext fails client verification.

## Privacy boundary

The server can observe owner/vault IDs, source IDs, entity types, edge endpoints, counts, creation times and ciphertext sizes. This reveals topology and broad categories. Relationship meaning and notes remain client-encrypted. Do not call this a fully hidden graph or infer legal rights from it.

## Deployment and compatibility

Both migrations are additive: `20261008_continuity_graph.sql`, then `20261008_asset_workflow.sql`. Both were applied to production on 8 October after explicit approval. Rollback-only production tests passed creation, evidence metadata, invalid-link rollback, graph replacement, stale revision rejection and foreign-owner rejection. Existing records are not automatically converted; saving an explicitly typed asset synchronizes its graph. No backfill guesses categories or legal status.

## Asset workflow implemented locally

- Create/edit/reveal supports ownership type, owners, nominees and beneficiaries, separate exact basis-point allocations, nomination status and encrypted evidence notes. Duplicate people, unknown IDs, totals over 100%, multiple sole owners and nominees under OPTED_OUT/NOT_APPLICABLE are rejected. Blank allocations remain unknown; partial allocations are not represented as complete.
- Assets link existing documents, policies and instructions. Each relationship has its own encrypted DEK and authenticated endpoints. These relationships do not grant access or establish legal rights.
- `save_vnext_asset` saves ciphertext, optional encrypted attachment metadata, graph entities and asset-managed relationships in one owner-authorized database transaction. Edits use expected revision checks. Invalid graph writes roll back the record update; edits replace only that asset's managed edges.
- Evidence attachments can be uploaded on asset creation and edit, then downloaded and decrypted locally. Object upload precedes the database transaction; uncertain upload/save outcomes retain ciphertext for later reconciliation rather than risking data loss.
- Reveal includes Overview, Property, Documents, Insurance, People, Continuity and History tabs. Linked records use client navigation. History shows the current revision, explicitly not a signed historical-version browser.
- Full client suite: 201 tests passed. After the navigation refinement, 10 affected tests passed again. Production build, lint, local database isolation/atomicity suites and encrypted restore checks passed. Build reports a non-blocking bundle-size warning.
- Production migrations are applied; matching frontend deployment is underway. Signed-in hosted acceptance remains pending. Local tests do not establish physical-device acceptance or an independent security audit.

## Still required by the specification

Record forms also support explicit continuity type, document existence/execution/physical-original status, jurisdiction and last verification date. People support multiple encrypted roles. Existing records default to unknown; no inferred execution or nomination status is backfilled.

1. Deploy and run hosted acceptance of the asset workflow; signed historical-version browsing remains a later history increment.
2. Document execution/existence/original location/version models; execution status must not imply legal validity.
3. People with multiple roles and shared professional relationships.
4. Access, trigger and verification-policy schemas, with no trigger activation until sharing/recovery acceptance is complete.
5. Encrypted jurisdiction context, insurance relationships and meaningful client-side coverage scoring.
6. Overview, asset/person/document detail views and Continuity navigation integration.
7. Real two-account sharing, physical recovery and independent review remain launch gates.

Do not implement AI, custody, transfers, legal entitlement calculators, automatic death detection or professional marketplaces.
