# LEQVOR

A private workspace for important records, trusted people, personal wishes, and the instructions that connect them.

**LEQVOR by LENVOR — Assets | Records | Forever**

Website: [leqvor.vercel.app](https://leqvor.vercel.app) · Repository: [charlieCipher/LEQVOR](https://github.com/charlieCipher/LEQVOR)

**Branding updated: 5 October 2026.** LEQVOR is the product name. The LEQVOR master specification defines the current architecture. The implementation notes below are a historical progress snapshot from 12 September 2026, not a current deployment-status report.

This README records what we planned, what we completed, what we verified, and what remains. **Implemented locally does not mean deployed, independently audited, or ready for production.**

## 1. What we planned

### Product direction

Build a private continuity system that helps someone understand:

1. **What exists?** An account, document, property, policy, or personal record.
2. **Why does it matter?** Its context and purpose.
3. **Where is it?** The original document, institution, or storage location.
4. **Who needs to know?** Family members, trusted contacts, and professionals.
5. **What should happen next?** Clear instructions and next actions.

The product should be useful during travel, illness, emergencies, incapacity, family administration, and after death. It is not a replacement for a will, an inheritance-transfer service, or a financial adviser.

### Experience and design

- Preserve the brand while making the website easier to navigate and more satisfying to use.
- Develop the requested LEQVOR design direction: scenic sidebar, purple controls, compact screens, archive imagery, and a portrait-based people view.
- Organize the main experience around **Home, Vault, People, Continuity, and Security**.
- Place letters and legacy wishes under Continuity rather than making Legacy a separate primary section.
- Give users useful loading, empty, validation, success, and error states.
- Separate fictional preview information from real account data and real security status.

### Security and reliability

- Repair the broken frontend/backend flows and inspect the actual Supabase database.
- Encrypt private content locally, including V5 titles and filenames.
- Connect recovery to the actual vault keys, rather than generating an unrelated phrase.
- Separate account authentication from vault unlocking.
- Apply least-privilege database and storage access.
- Clear revealed content and invalidate pending operations when the vault locks.
- Provide encrypted export and move toward recovery that does not depend on the hosted service.
- Do not use AI to analyze private vault contents.

The current architecture and phased plan are in the LEQVOR master specification. The earlier V5 specification is retained as historical reference.

## 2. What we completed

### Phase A — Initial analysis and repair

We inspected the React/Vite application, authentication, encryption, uploads, family and letter flows, database migration, and security UI.

The initial review found:

- A backend address that initially failed to resolve; it subsequently became reachable.
- A live database still using the old schema, without the new encrypted fields and family/letter tables.
- Public-read policies on assets and profiles.
- Integrity hashes that depended on JSON property order and could fail after PostgreSQL `jsonb` reordered fields.
- A recovery phrase that was not connected to separately chosen record secrets.
- Inconsistent locking of private records and letters.
- Upload failures that could leave the interface stuck.
- Hardcoded health scores, security events, and approval controls that did not represent working protections.
- Merge-conflict markers and incomplete setup instructions in the original README.

**Completed repairs:**

- Added canonical JSON integrity hashing and compatibility with the original V4 hash format.
- Improved form validation, secret confirmation, upload error handling, retry behavior, and attachment cleanup on save failure.
- Added configuration validation and clearer connection errors.
- Reworked the dashboard and forms around actual data and functional actions.
- Unified private-content locking and protected against late decryption results appearing after navigation.
- Preserved older records and added read compatibility for older CryptoJS attachments.
- Added automated tests and applied compatible dependency security updates.

### Phase B — Supabase changes applied to the live project

On **10 September 2026**, we inspected the existing Supabase project's schema and policies and successfully applied the compatible V4 repair.

The applied changes:

- Added encrypted asset fields and the family, assignment, and letter tables.
- Supplied a default for the legacy required asset `type` field so newer saves could succeed.
- Provisioned missing profiles and added a signup trigger.
- Removed the old public-read policies on assets and profiles.
- Added owner-scoped access rules and kept vault storage private.
- Prevented clients from changing their own account tier.
- Preserved existing records.

The corresponding repair is recorded in [20260910_restore_vault_flows.sql](supabase/migrations/20260910_restore_vault_flows.sql).

**This completed V4 repair must not be confused with the later V5 migration, whose remote application is not recorded as completed.**

### Phase C — V5 implemented locally

The current source contains the following V5 capabilities:

| Area | Implemented work | Boundary |
| --- | --- | --- |
| Interface | Distinct authentication, overview, vault, record creation/detail, people, continuity, and security screens | Full production browser validation remains pending |
| Preview | Explicit `?preview=1` sample workspace with fictional, session-only information | Preview does not prove live database functionality |
| Vault encryption | Random vault master key; separate password and recovery wrappers; independent record and file keys; authenticated AES-GCM envelopes | Requires V5 schema and end-to-end validation |
| Private metadata | Encrypted titles, descriptions, instructions, filenames, and trusted-person information | Older V4 plaintext metadata remains until migrated |
| Recovery | Mandatory recovery verification during setup, recovery-based vault-password replacement, and recovery practice | Does not make old V4 phrases recover separately encrypted records |
| Vault workflows | Create, list, reveal, update, delete with fresh authentication, and encrypted attachment upload/download | Interrupted operations and cleanup still need production validation |
| Locking | Short reveal expiry, focus-loss locking, configurable inactivity Cold Lock, and Lock & Purge | Browser code cannot guarantee forensic memory erasure |
| Authentication | Account sign-in/password reset and Supabase TOTP challenge/enrollment | Passkeys and device-bound unlock remain unimplemented |
| Continuity | Encrypted instructions, templates, original locations, contacts, and factual completeness/readiness calculations | Readiness is not a security score or legal assessment |
| Export | Encrypted recovery packages containing records and attachment objects | A complete restore/import workflow is still pending |
| Offline verification | Recovery-package verification using the package and recovery secret without an account session | Drill utility; does not restore the live vault |
| Sharing foundation | Key-wrapping, recipient-device migration, and key-rotation primitives | Invitations, verified recipients, authorized grants, and recipient UI are unfinished |
| History foundation | Signed hash-chain primitives and checkpoint validation | Durable signed history and independent checkpoint services are unfinished |
| Trust surfaces | Draft trust, security, privacy, status, disclosure, and subscription-pricing pages | Not finalized policies, monitored services, or working billing |
| Legacy migration | V4 record import creates an encrypted V5 copy without destroying the original | V4 standalone-letter import UI remains pending |

See [the V5 implementation and release ledger](docs/V5-IMPLEMENTATION.md) for the detailed boundaries.

### Phase D — Insurance continuity

Insurance was added as a record type within the vault and continuity system, with a hub at `/app/vault/insurance`.

Implemented locally:

- Separate policy owner, insured person, beneficiary, and trusted-contact roles.
- Links between policies, asset records, and people, including reverse links.
- Encrypted provider details, policy reference, advisor/contact, renewal date, and claim/continuity instructions.
- A factual nine-item Claim Readiness checklist and Coverage Map.
- Handling for missing people, invalid dates, unavailable references, and incomplete records.
- Unit tests and component workflow tests for insurance behavior.

These features do **not** grant access, establish legal entitlement, verify coverage with an insurer, submit claims, recommend insurance, or send renewal notifications. See [insurance continuity scope](docs/INSURANCE-CONTINUITY.md).

## 3. What we verified

| Check | Recorded result | Scope |
| --- | --- | --- |
| Earlier repaired frontend build | Passed | Before subsequent V5 changes |
| Earlier frontend lint | Passed with warnings in older components | Not a fresh result for the current tree |
| Initial repair test suite | 10 tests passed | V4 crypto compatibility, validation, locking, and error recovery |
| Dependency security update | Reported zero vulnerabilities at completion | Historical result, not a current audit guarantee |
| Live database write checks | Passed | Record, family, letter, and assignment writes in a rollback-only transaction |
| Live database access checks | Passed | Anonymous asset/profile reads blocked, profile tier protected, private storage, missing-profile check |
| Local browser check after V4 repair | Dashboard loaded without the earlier missing-table errors | Not a complete V5 browser/security test |
| Current V5 and insurance test coverage | Test files are present | Latest complete pass/fail result was not re-established for this README update |

The database validation writes were **rolled back**; no validation records were intentionally left in the live vault.

Current test files cover V4 compatibility, V5 encryption and recovery, session locking, event filtering, sharing/history primitives, readiness, recovery-package validation, and insurance workflows. Do not interpret test-file presence as proof that all current tests pass.

## 4. What remains planned or unfinished

- [ ] Apply and validate the V5 migration in a reviewed staging environment.
- [ ] Run the executable V5 database isolation tests and real multi-account storage checks.
- [ ] Complete signup, email redirects, TOTP, reload, and clean-device recovery testing.
- [ ] Run the current full build, lint, automated tests, and desktop/mobile browser checks before release.
- [ ] Add reliable reconciliation for interrupted uploads and failed ciphertext cleanup.
- [ ] Complete verified recipient identity, invitations, server-authorized sharing, revocation, and recipient access.
- [ ] Connect durable signed event/version history and independent checkpoints.
- [ ] Complete an independent recovery distribution, package importer, secondary backups, and isolated restore exercises.
- [ ] Finish V4 standalone-letter migration and a separately verified process for removing old plaintext copies.
- [ ] Complete remaining continuity graph editing, drills, freshness reviews, and scheduled notifications.
- [ ] Implement server-enforced subscriptions/billing and professional workflows.
- [ ] Evaluate later-phase passkeys, device keys, Shield, Duress/Safe Vault, and PIN scrambling.
- [ ] Finalize production headers, separate public/vault origins where required, privacy/retention terms, status monitoring, and disclosure processes.
- [ ] Obtain an independent security review and penetration test.
- [ ] Complete and verify deployment of the current source.

**Hosting status:** a private Sites project was registered and its identifier saved in `.openai/hosting.json`. Registration is complete; a successful source push, saved version, and live deployment are not recorded as completed in this work. Do not treat the manifest as evidence that the current website is published.

## 5. Run the project locally

Use Node.js 22 or newer and npm.

```sh
npm ci
```

Copy `.env.example` to `.env.local`, then provide the Supabase project URL and public anon/publishable key. Never put a service-role or secret key in a `VITE_` variable.

```sh
npm run dev
```

Use the exact local URL printed by Vite. The sample workspace can be viewed by adding `?preview=1`; it is separate from authenticated storage.

```sh
npm test
npm run lint
npm run build
```

Configure approved local and deployed redirect origins in Supabase Authentication for email confirmation and password recovery. Vite embeds public configuration during the build, so changing environment settings alone does not update an already-built static bundle.

For an offline recovery drill:

```sh
node scripts/verify-recovery.mjs "path/to/encrypted-vault.leqvor"
```

Follow [the offline recovery instructions](docs/OFFLINE-RECOVERY.md). Enter the recovery secret only at the hidden prompt; do not place it in command arguments or environment variables.

## 6. Project map and supporting documents

| Location | Purpose |
| --- | --- |
| `src/App.jsx` | Authentication, public trust routes, and vault entry gates |
| `src/app/` | Current workspace and feature screens |
| `src/features/auth/` and `src/features/vault/` | TOTP and vault-session setup/unlock |
| `src/components/` | Forms, records, people, continuity, security, and shared UI |
| `src/modules/security/` | V4/V5 crypto, sessions, recovery, safe events, and history primitives |
| `src/modules/vault/` | Legacy and V5 vault services |
| `src/modules/continuity/` and `src/modules/insurance/` | Readiness and insurance relationships |
| `src/styles/` | Design tokens and screen styling |
| `supabase/migrations/` | Historical V4 repair and later V5 schema |
| `supabase/tests/` | Database isolation validation |
| `tests/` | Automated crypto, recovery, readiness, insurance, and UI tests |
| `scripts/verify-recovery.mjs` | Offline package-verification command |
| `.openai/hosting.json` | Registered Sites project configuration |

Supporting documents:

- [Original V5 product specification](docs/V5-product-specification.txt)
- [V5 implementation and release ledger](docs/V5-IMPLEMENTATION.md)
- [Insurance continuity scope](docs/INSURANCE-CONTINUITY.md)
- [Offline recovery instructions](docs/OFFLINE-RECOVERY.md)

The earlier V4 migration is retained as historical source. Do not blindly rerun historical policies over a repaired database. Review the existing migration state before applying changes, and keep V4 live validation separate from V5 staging and release approval.
- [Current LEQVOR master architecture](docs/LEQVOR-MASTER-ARCHITECTURE.md)
- [Record transactions and cleanup deployment](docs/RECORD-TRANSACTIONS.md)
- [Account-to-record validation evidence](docs/ACCOUNT-RECORD-VALIDATION.md)
