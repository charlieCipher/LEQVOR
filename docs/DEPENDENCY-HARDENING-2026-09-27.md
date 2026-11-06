# Dependency hardening — 2026-09-27

All 19 direct dependencies now use the exact versions already resolved in the lockfile. No resolved package versions were changed. Future npm additions save exact versions via `.npmrc`; release installs should use `npm ci`.

`npm run verify` now starts with `npm audit --audit-level=low`, including development dependencies. Registry failures stop verification. Audit findings require review, not automatic forced upgrades.

Validation on this computer:

- npm audit: zero known vulnerabilities reported.
- npm ls --depth=0: all direct installed versions match the manifest.
- ESLint: passed with zero warnings allowed.
- Vitest: 141 tests passed across 33 files.
- Production build and local artifact checks: passed.

The test runner emitted existing Node local-storage-path and jsdom navigation warnings; neither failed the suite. No UI, authentication configuration, production database or deployment changes were made in this step. These results do not establish live HTTP header enforcement, real-device compatibility, live backend isolation, or independent security approval.
