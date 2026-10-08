# LEQVOR vNext implementation

The user-supplied `LEQVOR-VNEXT-SPECIFICATION.txt` is the target specification as of 8 October 2026. Existing client encryption and owner isolation remain mandatory.

## First increment: relational continuity graph

Prepared migration: `supabase/migrations/20261008_continuity_graph.sql`. This migration has not been applied to production.

- `continuity_entities` indexes existing records and trusted people; it does not copy their plaintext or create a second person directory. Source IDs are stable node IDs. Type is explicit: PERSON, ASSET, DOCUMENT, POLICY, INSTRUCTION, OTHER.
- `continuity_edges` stores individually encrypted relationships with independent DEKs wrapped by the VMK. Composite foreign keys ensure both endpoints belong to the same vault and owner. Deleted source records remove their graph index and incident edges, not the other source records.
- Owner-only restrictive RLS applies to both new tables. Authenticated clients can read, insert and delete their own graph entries. In-place updates are disabled. No recipient read policy or record grant is added.
- The existing V5 vault service exposes a separate `graph` service. It registers source entities, creates validated relationships and decrypts the graph on the active client. React does not call Supabase directly.
- Client validation restricts relationship directions and uses integer basis points for an individual allocation. Aggregate allocation totals, nomination evidence/status and structured document state are subsequent increments.
- Relationship meaning, notes and allocation are encrypted. Both endpoint IDs are duplicated inside authenticated ciphertext, so changing the visible topology without changing ciphertext fails client verification.

## Privacy boundary

The server can observe owner/vault IDs, source IDs, entity types, edge endpoints, counts, creation times and ciphertext sizes. This reveals topology and broad categories. Relationship meaning and notes remain client-encrypted. Do not call this a fully hidden graph or infer legal rights from it.

## Deployment and compatibility

The migration is additive, with no conversion, renaming or deletion of legacy assets or existing encrypted records. No UI automatically loads the graph yet; this avoids breaking hosted users before the migration is reviewed and deployed. Existing encryption formats and CRUD remain unchanged. No automatic backfill guesses categories or legal status.

## Still required by the specification

Asset increment: create/edit/reveal supports ownership type, selected owner/nominee/beneficiary person IDs, separate allocations per group and nomination evidence notes. Percentage input is parsed into exact integer basis points. Blank means unknown; partial totals are permitted but not represented as complete. Duplicate people, non-People IDs, total allocations above 100%, multiple sole owners and nominees under OPTED_OUT/NOT_APPLICABLE are rejected. Existing People are referenced without copying contact profiles. These links are encrypted within each asset record and are not yet synchronized to continuity_edges; no grants or legal authority are created. Nomination evidence attachments and dedicated related asset tabs remain future increments.

Second increment: record create/edit/reveal now supports an explicit continuity type, asset nomination status, document existence/execution/physical-original status, jurisdiction and last verification date. People creation supports multiple encrypted roles, displayed in person details. These are per-record attributes in existing encrypted payloads, not a vault-wide JSON aggregate. Existing records default to unknown; no inferred execution or nomination status is backfilled. Typed ownership, nominee allocations and linked custodians still need their graph workflows. This increment does not require the graph migration to be installed and does not automatically register graph entities.

1. Improved asset/ownership/nomination model and encrypted evidence, with aggregate allocation validation.
2. Document execution/existence/original location/version models; execution status must not imply legal validity.
3. People with multiple roles and shared professional relationships.
4. Access, trigger and verification-policy schemas, with no trigger activation until sharing/recovery acceptance is complete.
5. Encrypted jurisdiction context, insurance relationships and meaningful client-side coverage scoring.
6. Overview, asset/person/document detail views and Continuity navigation integration.
7. Real two-account sharing, physical recovery and independent review remain launch gates.

Do not implement AI, custody, transfers, legal entitlement calculators, automatic death detection or professional marketplaces.
