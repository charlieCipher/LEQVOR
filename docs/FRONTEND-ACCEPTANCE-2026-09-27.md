# LEQVOR frontend acceptance — 27 September 2026

## Implemented and verified locally

- Recovery placeholder has a valid image role and accessible name; masked characters remain hidden from assistive technology.
- Authentication mode changes focus the new heading. Password guidance is linked to its input, and switching modes conceals and clears the password. Mode switching is disabled while a request is pending.
- Passkey sign-in is visibly unavailable until a real integration exists. Password sign-in remains usable. This does not implement passkeys or weaken authentication.
- Existing dialog and record-wizard keyboard fixes remain in place. No scenery, palette, page composition or encryption changes were made during this pass.

The local axe-core 4.13.0 audit covered authentication, Overview, Vault, new record, existing sample record, People, Continuity and Security at 320, 768 and 1440 CSS pixels: 24 checks. After correcting the recovery placeholder, no automatically detected WCAG A/AA violations or page-level horizontal overflow remained. Authentication was audited without the preview parameter; workspace routes used sample data.

The scanner reported incomplete contrast checks over gradients and images. Those are unresolved manual checks, not passes. The audit does not exercise every dialog/state or certify WCAG conformance. Desktop inspection confirmed the selected scenic sign-in composition remains intact.

Full release verification passed: 145 tests in 33 files, zero-warning lint, production build, build-artifact checks and zero known npm audit vulnerabilities. Existing Node local-storage-path and jsdom navigation warnings did not fail tests.

## Repeat the rendered-page audit

Start Vite locally with `npm run dev -- --host 127.0.0.1 --port 5176 --strictPort` and open `/scripts/frontend-audit.html`. Select Run checks. The tool uses only local sample routes and reports rule IDs/selectors, not input values or record contents. It requires development mode and localhost. The audit import is removed from production by Vite; axe-core is a pinned development dependency.

## Remaining acceptance gates

| Gate | Status / evidence required |
| --- | --- |
| Contrast on gradients/scenery | Manual measurement at relevant text/background positions is still required; automated results are incomplete. |
| Vivo Android + TalkBack | Device is owned by the user but is not connected to this session. Follow the checklist below. |
| iPhone/Safari and GrapheneOS/Vanadium | No physical devices were available; viewport simulation is not a substitute. |
| Live selected sharing | AccessPlanner has no connected verified-recipient/grant adapter. Sample plans do not confer access. |
| Live passkeys/device enrollment | No connected sign-in/enrollment/device-registry adapter in the current frontend. |
| Shield and verified history | Preview settings and illustrative history are not signed approvals or verified live events. |

These integration gates require backend contracts, real account/device enrollment and end-to-end evidence. A finished-looking screen must not be treated as evidence that the security operation exists. Production launch is not approved by this report.

## Vivo hands-on checklist

Use a reachable HTTPS test deployment with sample data. The computer's `127.0.0.1` address cannot be opened directly from the phone; USB port forwarding or a test deployment must be arranged first. No public tunnel or LAN exposure was configured by this change.

Record the Vivo model, Android/browser versions and test URL. Mark each item Pass, Fail or Not tested:

1. Open authentication in portrait and landscape. Confirm scenery loads, labels remain readable, and the form can scroll when the software keyboard opens.
2. Increase text/display size. Confirm sign-in, reset and account-creation controls are reachable without clipped text.
3. With TalkBack enabled, traverse headings and form controls. Password should be named once with its guidance; mode changes should announce the new heading. Do not submit real credentials for this visual check.
4. Open the sample workspace. Visit Home, Vault, Continuity, People and More/Security. Confirm the bottom navigation does not cover actions.
5. Search/filter the Vault, switch grid/list, open a sample record, change tabs, reveal and hide only the fictional example.
6. Walk through Add Asset with a fictional title. Confirm each step is announced and validation directs focus to its field. Do not upload a private file.
7. Open and close an invitation dialog. Confirm background content is not reachable while it is modal and focus returns to the opening control.
8. Report failures by page, orientation, action and expected/actual result. Screen-reader speech, keyboard behavior and physical touch usability cannot be inferred from desktop screenshots.
