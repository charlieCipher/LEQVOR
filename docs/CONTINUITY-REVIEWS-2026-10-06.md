# Continuity review update — 6 October 2026

Commit: 1f93cc3. Pushed to main; live LEQVOR bundle confirmed to include the update.

- Record editing supports an optional next review date in encrypted metadata.
- Ordinary edits preserve the prior review timestamp. Explicit confirmation starts a new annual period and clears the custom date.
- Custom dates follow the user's local calendar. Annual reviews become due at the exact anniversary interval (365 days).
- Continuity shows the due count and a full review list when more than three records exist.
- No email or background notification scheduling is represented as active.

Validation: 22 focused tests passed, including real cryptographic round-trip and plaintext exclusion for review dates, invalid date handling, and edit/confirmation UI behavior. Lint and release build/artifact checks passed. The existing large bundle warning remains.

Remaining external dependencies are unchanged: private authenticated hosted acceptance, second-device recovery/physical-device checks, live sharing and advanced-security acceptance, independent security review. Cleanup stays disabled and separate backup storage stays pending at the user's request. No authenticated production records were created or modified for this update.
