# Frontend release check

Run `npm run verify` from the repository root before preparing a release.

The command stops on a failure in any stage:

1. npm dependency audit, failing on any reported vulnerability (including development dependencies).
2. ESLint with zero warnings allowed.
3. The full Vitest suite.
4. Disposable PostgreSQL migration, isolation and transaction checks.
5. Synthetic encrypted-package restore into a fresh PostgreSQL instance.
6. Vite production build.
7. Local build-artifact checks.

Run `npm run check:database` separately for the database stage. It uses pinned PGlite (PostgreSQL in WebAssembly), applies the V5 migrations and executes SQL assertions without Docker, credentials or a production connection. Auth and storage contracts are minimal local fixtures. This tests database policies and functions, not hosted Supabase authentication, HTTP endpoints or actual object downloads. See `DATABASE-HARDENING-2026-09-28.md` for deployment limits.

Install release dependencies with `npm ci`. Direct dependencies are pinned to exact versions, and the committed lockfile fixes the resolved dependency tree. `.npmrc` saves future additions as exact versions. Update packages deliberately and run the full release check afterward; do not use forced audit fixes without reviewing the changes.

Run `npm run check:dependencies` to repeat the registry audit separately. It requires network access; a registry/network failure is a failed release check, not a clean audit. A clean result only means no known vulnerabilities were reported by the registry at that time and does not replace independent security review.

The artifact check validates HTML script/link/image references and CSS url references, the LEQVOR title, and required directives in the packaged `_headers` file. It rejects symlinks, `.env` files, `.map` files and `.pem`/`.key` files in the output. Errors do not print file contents. Run `npm run check:build` to repeat only the artifact check after building.

This is not a secret scanner, full dependency audit or exhaustive JavaScript import/link crawler. It does not prove that the deployment host applies `_headers`; verify real HTTP response headers on the chosen host before launch. It does not deploy, configure production authentication, test a live database, or certify device/browser compatibility. Environment-dependent features may be unconfigured in a build without deployment variables.

The three artifact-check tests use temporary synthetic files and include missing scenery, external resources and accidentally bundled environment/source-map files.

For rendered-page accessibility checks, use the development-only runner described in `FRONTEND-ACCEPTANCE-2026-09-27.md`. Automated violations and incomplete/manual checks must be reported separately.
