# Responsive and accessibility checks

## Follow-up: dialog and wizard keyboard acceptance — 2026-09-27

Shared dialogs now wrap Tab from the last available control to the first and Shift+Tab from the first to the last. Hidden, inert, disabled, non-tabbable and unrendered controls are excluded. Native dialog Escape handling and opener restoration remain intact. This addresses the earlier observed Shift+Tab escape from the dialog.

The record wizard focuses the new step heading on forward/back navigation. Final validation returning to an earlier step waits until that field is visible before focusing it.

Sixteen tests passed across modal accessibility, wizard validation, workspace navigation and workflows. Zero-warning lint, production build and artifact checks passed. In the local production preview, actual keyboard events verified both dialog boundaries, Escape closure and focus return to Invite Member. All four forward wizard transitions and Back focused the expected heading. Only fictional text was entered; no record or invitation was saved. The stopped preview server was restarted on port 5175 and the temporary viewport override reset.

These results do not complete physical-device, screen-reader or full contrast acceptance. Unconnected live sharing/security services remain separate integration work; preview controls are not evidence those backend flows are complete.

## Follow-up: record tabs and category filters

Asset categories now use grouped, pressed filter buttons instead of declaring tab semantics without tab panels. Record sections use a reusable, labeled tablist with linked tab/panel IDs, selected state and a single selected tab in the Tab order. Left/Right wrap focus; Home/End move to the first/last tab. Moving focus does not activate a section; native button activation with Enter/Space or click does. Activation retains the existing conceal-on-section-change behavior.

Twelve focused tests passed across tab navigation, workflows, pagination and insurance workflows. Tests cover manual focus movement, wraparound, panel association, filter state and concealment after switching away and returning. An existing record-opening test was scoped to its table to distinguish a record from the equally named category filter. Lint, production build and artifact checks passed. This pass used component tests; physical keyboard/screen-reader verification remains pending.

## Follow-up: secure cleanup review

VaultGate and V5RecordDetail now capture their mutable generation-counter objects explicitly in effect cleanup. Cleanup still increments the current counter rather than resetting it to an earlier numeric snapshot. No lock policy, reveal timeout or cryptographic behavior was weakened. The previously noted two cleanup warnings are resolved: lint passes with zero errors and warnings.

Eighteen focused component tests passed across vault gate, record conflict/edit lifecycle and secure actions. New StrictMode regressions confirm that an unlock resolved after unmount never activates VaultSession, and an old reveal completion cannot populate a newly mounted record screen. Existing blur cancellation, reveal expiry and pending-save checks also passed. Production build passed. These are mocked lifecycle checks, not independent cryptographic review or physical-device certification.

## Follow-up: frontend release checks

Full suite before cleanup: 133 tests in 30 files passed. Lint identified four errors, now fixed: mixed component/data exports were split into plain data modules, Vault pagination resets when filters change without a post-render effect, and a Node test imports process explicitly. Four obsolete blanket lint-disable comments were removed.

After changes, 25 relevant tests passed, including a new pagination regression covering externally changed search and clearing search. Production build passed. Lint exits successfully with zero errors and two existing ref-cleanup warnings in VaultGate and V5RecordDetail. Their security-sensitive invalidation behavior was not changed to silence warnings; these require separate review. This is not a production deployment or independent security review.

## Follow-up: empty and failed-load states

People searches with no matches now offer a reset action that clears both name and relationship filters. Workspace load failures explicitly warn that lists and completion totals may be incomplete; retry is disabled and labeled Retrying while pending. The loading spinner is decorative for assistive technology. Vault result counts expose a polite status region on layouts where the count is displayed.

Nine tests passed across workflows, People empty-state recovery, and screen loading/error boundaries; production build passed. These follow-up checks use component/service mocks, not a live network failure or backend test.

Local production build, sample workspace; no production data or Docker operations.

## Changes

- Added a shared device stylesheet: 44px minimum button targets on narrow/touch layouts, readable 16px form inputs, safe-area bottom spacing, viewport-bounded scrolling dialogs, and forced-colors outlines.
- Tablet archive cards use two columns to give titles and actions more room.
- Narrow-screen Vault Health, library statistics and Continuity progress no longer crowd their content. The asset summary retains its six-tile composition.
- Recovery placeholder text can shrink without displacing its icon and has an accessible label.

## Executed checks

Browser viewport widths: 320, 393, 412, 430, 768, 1366 and 1920 CSS pixels. Heights respectively: 740, 852, 915, 932, 1024, 768 and 1080.

At each size, authentication, overview, vault, new record, existing sample record, people, continuity and security rendered headings and had no page-level horizontal overflow: 56 checks. Tables/journey navigation may scroll within their own containers. Screenshot inspection covered the main mobile, tablet and desktop compositions during this work; these geometry checks do not prove every internal element is unclipped.

At 412px, inspection found no unnamed visible form inputs/selects/textareas across the inspected main screens. After corrections, the Vault button/input/select target-size check found no target below 43px (rounding tolerance for the 44px rule).

Keyboard Enter opened the named trusted-circle dialog with initial focus on Close. Escape closed it and restored focus to Invite Member. Shift+Tab from Close moved focus outside the document; full keyboard-cycle/screen-reader acceptance remains outstanding and is not reported as a focus-containment pass.

Production build passed. Six focused tests passed across modal accessibility, workspace navigation and loading/error boundaries.

## Compatibility limits

These are desktop Chromium viewport checks, not physical Pixel, Samsung, iPhone, GrapheneOS/Vanadium or Safari tests. No device-dependent passkey, biometric, virtual-keyboard, file-picker or recovery flow was exercised. Screen readers and full contrast/WCAG auditing remain pending. Forced-colors and safe-area rules were implemented but require device/OS verification.

GrapheneOS identifies Vanadium as its Chromium-based browser in its official [usage guide](https://grapheneos.org/usage). Responsive styling uses shared web standards, with no OS sniffing or Google service requirement added. This is not certification of GrapheneOS authentication compatibility.
