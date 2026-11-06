# LEQVOR test report — 20 September 2026

## Result

The real local backend lifecycle passed. The subsequent browser retry also passed unlock, record creation, deliberate reveal, edit, and persistence after reload. Browser file upload and deletion remain unverified. This is not production launch approval or an independent security audit.

| Check | Result | Evidence |
|---|---|---|
| Automated suite | PASS | 22 files, 100 tests; `npm test` exited 0 |
| New connection-policy regression tests | PASS | 5 tests; development loopback allowed, production HTTP and client secret keys rejected |
| Production build | PASS with warning | Build succeeded after the fix; main JS bundle approximately 575 kB, above the 500 kB warning threshold |
| Real local account authentication | PASS | Two disposable accounts authenticated through local Supabase Auth |
| Vault creation, persistence, recovery unlock | PASS | Actual database and application crypto, not mocked storage |
| Encrypted records and files | PASS | Actual upload/download and original-content decryption; plaintext canary absent from stored record row |
| Record editing and revision conflicts | PASS | Updated ciphertext decrypted correctly; stale revision rejected |
| Deletion and object cleanup | PASS | Transactional metadata deletion, cleanup queue processing and inaccessible deleted storage object |
| Cross-account isolation | PASS for tested cases | Account B denied A's vault/record/file reads, download, update, delete and owner impersonation insert |
| SQL isolation and transaction fixtures | PASS | Both rollback-only SQL suites passed in the preceding local run |
| Browser sign-in | PASS | Actual local app reached “ACCOUNT AUTHENTICATED · VAULT LOCKED” after sign-in and reload |
| Browser vault unlock | PASS on retry | Workspace visibly opened; after reload a mouse-dispatch timeout was followed by a successful unlocked record screen, showing that a tool timeout alone is not evidence of an application failure |
| Browser create and reveal | PASS | Five-step form saved a synthetic record; reference and instructions were hidden until explicit Reveal |
| Browser edit and persistence | PASS | Saved a changed description, revealed it, reloaded, unlocked again and confirmed the same edited content |
| Browser plaintext timeout/reload | PASS for observed behavior | Sensitive content and edit form returned to protected view; full reload required vault unlock and another deliberate Reveal |
| Browser attachment and delete controls | NOT TESTED | Actual storage/deletion passed via the backend runner; no equivalent browser claim |
| Authentication scenery | Observed | Desktop screenshot displayed the scenic background and contained sign-in panel |
| Production email/MFA, physical-device recovery | NOT TESTED | Local confirmed test users do not validate email delivery or MFA |
| Mobile/tablet accessibility acceptance | NOT TESTED in this run | Desktop visual inspection is not a responsive or WCAG audit |

## Fix made during testing

`src/supabase.js` previously required HTTPS even for the local development Supabase stack, disabling sign-in. It now allows HTTP only when Vite is in development and the hostname is loopback. Production still requires HTTPS, and administrative keys remain rejected. Five new regression tests cover this boundary.

## Environment and cleanup

Used the disposable local Supabase stack at `127.0.0.1:54321`, and a separate Vite test instance at port 5174. No production settings or records were changed. The backend runner removed its disposable users and ciphertext; the browser fixture account and its vault were also removed after testing. Local test credentials remain excluded from Git; the browser fixture credential file was deleted.

## Remaining acceptance work

Verify attachment upload/download and deletion through the UI, plus responsive/accessibility acceptance. Production configuration, email, MFA, cross-device recovery and independent review require separate evidence.

## Follow-up changes and checks — 21 September

### Sensitive-action credential clearing

The shared export/deletion verification form now clears password and OTP fields after rejected verification or action failure, as well as success. Submitted FormData entries are released in cleanup. Credential controls remain disabled throughout verification and the pending action to prevent new input from being silently discarded. Existing duplicate-submission and unmount guards remain in place; closing cannot cancel an action that has already started.

Fourteen tests passed across sensitive actions, reauthentication and modal accessibility. New tests cover rejected verification followed by fresh credentials, action failure, field clearing and disabled controls. Production build passed. No real export, deletion, production authentication change or Docker operation was performed.

### Trusted-person form

Encrypted contact creation now trims names/roles, rejects blank or overlong values before submission, blocks duplicate in-flight requests, and ignores saved callbacks after the form closes. Failed requests preserve input for retry; successful requests clear it. Adding a contact still neither sends an invitation nor grants permissions. Already-sent requests are not cancelled by closing the form.

Thirteen tests passed across the new contact-form cases, frontend access controls and insurance workflows. Production build passed. No Docker, production configuration, invitation or access-grant operations were performed.

### Encrypted statement form

Continuity statements now reject blank/oversized titles and whitespace-only intentions before encryption. A synchronous pending guard prevents duplicate in-flight submissions. Closing the form suppresses late saved callbacks; this does not cancel a request already sent to the server. Explicitly failed submissions retain the draft for retry, while successful submissions reset the form. Errors remain sanitized and submitted FormData entries are released after completion.

Fifteen tests passed across statement forms, readiness and existing workflows. New cases cover validation/focus, duplicate submission, closure during a pending save, draft retry and clearing after success. Production build passed. No Docker or production operations were performed.

### Continuity tracking and review suggestions

Live section progress now derives from saved, non-archived statements rather than an empty local checklist or the unrelated asset-completeness percentage. Duplicate statements do not count a section twice. Live labels say “Statement recorded”; legal validity and access readiness are explicitly outside this measure. Asset completeness remains separately labeled. Continue Plan selects the first unrecorded section.

The fixed October sample reminder is now limited to demo mode. Live review suggestions derive from record/statement review timestamps, prioritize overdue or missing dates, exclude archived items, and link to the relevant record. The UI explicitly says no email reminder is scheduled. This adds no scheduled notification service or production backend change.

Fifteen tests across readiness, existing workflows and insurance workflows passed, including active-section deduplication and date-derived review ordering. Production build passed. No live backend execution was performed for this change.

### Workspace keyboard navigation

The content region is programmatically focusable and named by section. Section navigation, including popstate-driven Back/Forward updates, moves keyboard focus to content after loading; opening a dialog during navigation suppresses that transfer so focus remains in the modal. Skip to content now explicitly focuses the region. Mobile navigation exposes the current page via `aria-current`, matching desktop behavior. The website tab name remains LEQVOR and no sensitive record title is added to it.

Ten focused tests passed across workspace navigation, existing workflows and dialog accessibility. Coverage verifies navigation focus, popstate focus, mobile current-page updates and the skip link. These are DOM tests, not a complete screen-reader or mobile-device audit. No Docker or backend changes were made.

### Record edit recovery and cancellation

Editing now offers Cancel, trims titles and enforces the same 1–160 character range as creation. Duplicate pending edit submissions are rejected. Save completions after unmount or reveal expiry do not invoke navigation/refresh callbacks. Ordinary failures retain the current form for retry until the existing reveal timeout; conflicts still hide stale content and require reload. Hide, timeout and successful saves also clear attachment metadata held by the detail view.

Thirteen focused tests passed, including cancel without saving, blank-title rejection, failed-save draft retention/retry, duplicate submission, unmount and a pending save crossing the 30-second reveal timeout. Production build passed. These use component/service mocks; no new live database or browser acceptance is claimed. An already-sent save may still finish server-side after the UI locks.

### Record creation validation and pending saves

The record wizard rejects whitespace-only titles and attachments above the shared 10 MB limit before advancing, and rechecks both before saving. A synchronous pending-operation guard rejects duplicate submissions while a save is in flight. A late result after unmount no longer invokes the page's saved callback. This does not cancel an already-sent server request or provide server-side idempotency after an ambiguous network failure.

Ten tests passed across the new wizard cases, insurance workflows and account-to-record service tests. Cases cover early rejection, replacing an oversized file, duplicate submissions, late completion after unmount, and retry after an explicit rejection with sanitized errors. The production build passed. No live backend, production or Docker actions were needed for this change.

### Dialog keyboard accessibility

People, continuity, export and record-deletion dialogs now expose purpose-specific accessible names. The shared native dialog restores focus to its still-connected opener when unmounted, and Escape cancellation follows React cleanup. Native modal behavior remains responsible for background inertness and focus containment; no custom keyboard trap was added.

Eighteen focused tests passed across dialog accessibility, pending sensitive-action cancellation, workflows and frontend access controls. Production build passed without a chunk warning. A browser check on the built sample workspace confirmed the trusted-circle dialog's name, initial focus on Close, Escape dismissal and focus restored to Invite Member. No invitation was sent and no backend or Docker operation was performed. This focused check is not a full WCAG audit.

### Frontend loading improvement (Docker-independent)

The workspace and vault gate now load through React lazy imports. The production main JavaScript artifact decreased from 575.31 kB to 402.85 kB (117.23 kB gzip); workspace and vault-gate code load separately. Total application functionality was not removed, and this is a bundle-size measurement rather than a measured page-speed improvement. The build no longer emits the 500 kB chunk warning.

A screen boundary announces module loading and offers a reload action on failure without displaying raw exception contents. Four focused test files (14 tests) passed, including lazy-loading success/failure, authentication-event ordering, vault gate and existing workflows. Browser smoke checks on the production build at port 5175 confirmed authentication rendering, the loading state, and successful sample-workspace rendering. No credentials were submitted and no Docker or backend operations were performed for this change.

VaultGate now explains focus/background locks and interrupted unlocks, clears submitted secrets after completion or failure, and disables switching recovery modes while an unlock is pending. Lock-on-blur remains enabled. Regression tests prove an interrupted unlock cannot reopen the workspace, a fresh retry succeeds, and failed unlock input/error handling does not expose secrets. Thirteen focused tests across vault gate, session boundary, record conflict and secure actions passed. The production build passed with the existing bundle-size warning.

The initial browser fixture was cleaned up on 20 September. Cleanup of the later retry fixture was attempted on 21 September but the local Docker engine was stopped; its cleanup status is tracked below.

Cleanup remains pending for the later local browser fixture. Docker restart failed with a stale `sailor-ingest.sock` runtime error. The runtime directory was preserved under a timestamped repair name and Docker restarted, but the engine still did not become available. No database volumes were deleted. The ignored fixture credential file is retained so `node .local-backend-validation/browser-cleanup.mjs` can remove exactly that account and its cascading vault/records when local Supabase returns. No production fixture exists. The test browser tab was already closed when work resumed.
