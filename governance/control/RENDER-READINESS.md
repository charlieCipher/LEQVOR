# Render control-service preparation — 16 October 2026

**Prepared locally; not deployed, pushed, merged or activated. Do not create the
Render service or apply SQL as a consequence of this document.**

## Reviewed source and boundaries

Draft [PR #1](https://github.com/charlieCipher/LEQVOR/pull/1) is open/unmerged,
head `dc476be98a063a3162c8ba7c6e42f14b845aa3e4`, branch
`codex/founder-native-and-audit`, base main
`d23e534393dbf753a4dc412a4d6a6de092d00d35` at inspection. These new preparation
changes are local working-tree changes beyond that PR head. Nothing was pushed:
the repository's automatic preview integrations must not accidentally deploy.

Reviewed assembly, HTTP/authentication boundaries, gateway, engine/policy,
PostgreSQL transaction/store adapters, SQL and control package. The previous
`server.mjs` intentionally only assembled a direct TLS listener. The new
`start.mjs` is an explicit Render HTTP listener behind a restricted edge proxy;
the original direct TLS factory is retained. `runtime.mjs` wires the actual
engine/store, Auth0 verifier, online signed access registry and admission policy.
No executor, enrollment, password reset, role assignment or activation route is
added. No customer files, customer database policies or production settings were
changed. Root authorization still requires A/B/C, threshold 2 and 72-hour cooling
with fresh confirmation. Customer decryption remains separate.

## Exact future Render settings

| Setting | Reviewed value |
| --- | --- |
| Runtime | Node, `NODE_VERSION=24.19.0` |
| Root Directory | `governance` |
| Build Command | `npm ci --ignore-scripts --include=dev --prefix control && npm run build --prefix control && npm test --prefix control` |
| Start Command | `npm start --prefix control` |
| Health Check Path | `/healthz` — process liveness only, **not authority readiness** |
| Region | Select Singapore to align with the governance Neon project; not configured |
| Automatic deploys / PR previews | Disabled; deploy only an independently reviewed exact commit after approval |
| Pre-deploy command | None — specifically no migrations or enrollment |
| Scale | One instance until a distributed limiter is implemented and tested |

Root `governance/control` is incorrect: runtime imports `../engine.mjs`,
`../gateway.mjs`, `../postgres-store.mjs` and their dependencies. Render excludes
files outside Root Directory. Root `governance` includes those modules and
excludes the customer source/configuration. No customer Vite build is required.
Sources: [Render monorepo boundaries](https://render.com/docs/monorepo-support),
[port binding and edge TLS](https://render.com/docs/web-services).

## Required configuration

Use Render's server-side secret settings, never customer `VITE_` variables or
committed real `.env` files. The checked-in `.env.example` contains placeholders.
`start.mjs` does not load `.env.local`, the CLI session or root customer env.

| Environment variable | Purpose |
| --- | --- |
| `NODE_ENV` | Exactly `production` |
| `NODE_VERSION` | Render runtime selection: `24.19.0` |
| `RENDER` | Render-provided; must be exactly `true` |
| `PORT` | Render-provided port, validated integer 1024–65535 |
| `RENDER_EXTERNAL_URL` | Render-provided HTTPS service origin; must exactly match control origin |
| `LEQVOR_CONTROL_ORIGIN` | Separate exact HTTPS origin, never `leqvor.vercel.app` |
| `LEQVOR_RENDER_PROXY_CIDRS` | Comma-separated independently reviewed socket-peer CIDRs; no default, minimum /24 IPv4 or /64 IPv6 |
| `LEQVOR_AUTH0_ISSUER` | Exact separate Auth0 tenant/custom-domain issuer, HTTPS with trailing slash |
| `LEQVOR_AUTH0_CLIENT_ID` | Reviewed control end-user client, not a customer or M2M client |
| `LEQVOR_GOVERNANCE_DATABASE_HOST` | Exact public Neon endpoint shown in `.env.example` |
| `LEQVOR_GOVERNANCE_DATABASE_URL` | **Secret:** SQL-created `leqvor_governance_control` credential, database `neondb`, direct endpoint |
| `LEQVOR_GOVERNANCE_POLICY_SHA256` | Independently verified canonical policy hash, protected separately from the database |
| `LEQVOR_ACCESS_REGISTRY_URL` | Separate HTTPS signed live-authorization endpoint |
| `LEQVOR_ACCESS_REGISTRY_ISSUER` | Exact issuer of signed registry documents, distinct from the Auth0 issuer |
| `LEQVOR_ACCESS_REGISTRY_BEARER` | **Secret:** scoped read credential, 32–256 URL-safe characters |
| `LEQVOR_ACCESS_REGISTRY_PUBLIC_JWK` | Public-only P-256 JWK JSON with exactly kty/crv/x/y; never private d |
| `LEQVOR_ACCESS_REGISTRY_KEY_SHA256` | Independently verified lowercase hex RFC7638-style thumbprint of that public key |

No founder signing credential belongs on Render. No Auth0 management key or
client secret is required by this bearer-verifying API. `DATABASE_URL` and
Supabase credentials are not runtime fallbacks. TLS-disable and `NODE_OPTIONS`
overrides are rejected. Errors/logs never contain tokens, targets, raw provider
errors, connection strings, imported evidence or keys. Outcomes log only request
ID and HTTP status. SIGTERM drains connections before closing the pool, with a
20-second shutdown limit; ambiguous database commits are never retried.

## Transport acceptance still required

Render terminates public TLS and forwards HTTP internally. The adapter requires
the **socket peer** to match a narrow reviewed CIDR, exact Host, a single exact
`X-Forwarded-Proto: https`, and no conflicting forwarded-host/Forwarded header.
Duplicate headers, insecure assertions and header-only spoofing from other peers
are denied. Client IP claims in X-Forwarded-For never become an admission or
authorization identity. The existing exact Origin, same-origin Fetch Metadata,
no-cookie/no-CORS policy, bounded body and request/header limits remain.

**This is conditional proxy trust, not cryptographic edge authentication.** We
have not observed Render's actual peer addresses or verified whether other
private-network services can connect using an allowed peer/address. No private
range is assumed trusted. Before deployment, verify Render overwrites forwarded
protocol, pin the ingress peers, and ensure untrusted private-network services
cannot impersonate those peers. If stable isolated ingress cannot be established,
use a separately authenticated reverse-proxy/mTLS ingress instead. Do not solve
this by allowing 0.0.0.0/0 or all private addresses. Initial admission is bounded
per real peer with a global four-request concurrency cap. Distributed abuse/load
acceptance is pending; do not scale this implementation horizontally yet.

`GET /healthz` intentionally discloses only process liveness and is reachable by
platform health checks without admin credentials. All governance operations
still pass transport/authentication/authorization checks. Local continuation now
includes `console-host.mjs`: fixed allowlisted browser assets, same-origin callback
and public configuration only, strict CSP, no cookies/CORS, no source-directory
or secret-file serving. `console-session.js` connects the existing console to
`pkce-session.js`. An optional independently verified
`LEQVOR_CONTROL_CHECKPOINT_JSON` enables the root views; absent it, only sign-in
and an inactive-authority notice appear. There is no policy/checkpoint discovery
or fabricated pending-C policy. Real hostname/callback and hosted acceptance are
still required; do not use permissive CORS as a workaround.

## Auth0 issuance and fresh MFA

The API verifies RFC9068 `at+jwt` access tokens using the exact configured tenant
JWKS, RS256/ES256 only; exact single audience `leqvor-control-console`; pinned
`client_id`; nonempty subject/jti; integer issuance/expiry, at most 300 seconds;
and the provider-signed claim
`https://leqvor.vercel.app/control-authentication` containing exactly
`{authenticated_at: <actual Unix seconds>, mfa: true}`. JWT roles, plain acr/amr,
factor enrollment, ID tokens, machine/delegated identities and refreshed token
issuance timestamps do not substitute for this proof. Mutation freshness is
rechecked after asynchronous role lookup. Requests remain subject to independent
founder signatures even when the admin role is FOUNDER.

Two Post Login Action sources are included; their provider versions are now
published and bound in this order (see `AUTH0-SETUP-20261016.md`):

1. `auth0-challenge.mjs`: require the configured client, interactive flow and
   actual recent password/passkey primary authentication; invoke `challengeWithAny` for enrolled
   roaming WebAuthn or OTP. Never emit a proof merely because MFA was requested.
2. `auth0-action.mjs`: run **after** the first Action resumes; require actual
   recent completed primary and MFA timestamps, then set the signed proof claim.

Each exported function was converted to Auth0's `exports.onExecutePostLogin` form
in the reviewed tenant. Both Actions use the Action configuration
`LEQVOR_CONTROL_CLIENT_ID`, matching the service client ID. They reject refresh
and non-interactive control flows. Enroll supported MFA privately first. Configure
the separate API RFC9068 profile, exact audience and <=300-second lifetime;
the control login must use Authorization Code + PKCE, fresh authentication, and
avoid requesting extra audiences/userinfo. Auth0's documented multi-audience
tokens are deliberately denied to preserve the existing exact audience rule.
Federated/passwordless primary assertions are not accepted by these Action
sources; an upstream SSO timestamp must not silently count as fresh primary
authentication without a separately reviewed identity-provider mapping.

Legacy `api.multifactor.enable()` may finish MFA only **after** Actions; treating
that call as completed MFA would be unsafe. The two-Action ordering is necessary.
Provider availability, first login, actual issued claims, sign-out/revocation,
clock behavior and refresh denial still require real tenant acceptance. Sources:
[Auth0 token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles),
[Auth0 MFA ordering](https://support.auth0.com/center/s/article/using-actions-mfa-authentication-method-is-missing-on-first-login).

## Independent live roles and revocation

`access-registry.mjs` implements a concrete HTTPS client and signature verifier
for the mandatory independent role/session adapter. It does **not** invent a
directory, default founder, signer key or role from customer data. A separately
controlled authorization operator must return a freshly signed nonce-bound decision
after checking live role assignment and verified Auth0 session revocation. This external
producer is now implemented locally with a protected SQL directory, KMS signer
adapter and separate HTTP/start boundary; see `AUTHORIZATION-SERVICE.md`. Its
directory/signer resources, protected operator workflow and live service remain
**not provisioned**. No independence is claimed merely from two service names.

Request: authenticated POST JSON containing `nonce` (32 fresh random bytes as
hex), `identity_issuer`, `subject`, `token_id`, and `expires_at` (milliseconds).
Response: HTTP 200, Content-Type `application/jwt`; header ES256,
`typ: leqvor-control-access+jwt`; claims:

```text
iss                 exact LEQVOR_ACCESS_REGISTRY_ISSUER
aud                 exact LEQVOR_CONTROL_ORIGIN
identity_issuer     exact LEQVOR_AUTH0_ISSUER
nonce               exact fresh request nonce
iat, exp            integer seconds, validity 1–60 seconds
jti                 unique document ID
grants              at most 128 entries, each exactly:
                    subject, token_id, expires_at (milliseconds), role
```

Only one matching subject+jti grant is accepted, with the exact access-token
expiry and an assigned supported role. A fresh bounded no-cache, no-cookie,
redirect-denying, four-second fetch is performed during token and role checks.
Both checks bind to the same verified token identity; changing a JWT role has no
effect. Missing/revoked/expired grants, duplicate grants, invalid signatures,
wrong tenant/audience, outages and oversized responses deny access.

The random nonce binds each decision to its lookup; a previous valid signed
response cannot satisfy the next lookup even before its expiry. The producer
must query its live authoritative revocation/role data before signing, not wrap
a stale cached allowlist with a new nonce. No local stale-success cache is used.
As with any remote authorization, revocation immediately after a successful
decision still requires an operational race/consistency policy. The signing private key stays with
the independent operator, never this service. The registry read credential cannot
sign grants or authorize founder root actions.

## Neon migration and privilege plan — NOT applied

Verified project **leqvor-governance**, `crimson-dust-50927470`, production branch
`br-curly-tooth-ao6663qp`, `neondb`, **AWS Singapore**, PostgreSQL 18.6. The actual
Node24 `pg` connection with certificate-verified TLS succeeded. `BEGIN READ ONLY`
inspection returned **0 founder_governance schemas, 0 customer platform schemas,
0 control runtime roles**. Inspection used only the locally protected setup
credential, not the runtime service. No SQL writes or migrations were executed.

After explicit approval, a separate privileged migration ceremony would apply:

1. `001_founder_state.sql`
2. `002_execution_journal.sql`
3. `003_control_permissions.sql`

The third migration requires an empty/inactive separate `neondb`, rejects
customer-platform schemas and conflicting preexisting role names, and creates
three basic SQL roles as NOLOGIN with no elevated flags or memberships:

| Principal | Allowed operations |
| --- | --- |
| control | SELECT root/audit; UPDATE root document; INSERT audit |
| executor | SELECT root/audit/journal; INSERT journal; reservation row locks |
| auditor | SELECT the four governance tables; no writes |

No runtime principal owns tables or schemas, creates objects, inserts root_state,
changes roles, deletes/truncates audit, grants permissions or enrolls keys. The
executor's column UPDATE grant exists solely for PostgreSQL FOR UPDATE; immutable
statement triggers still deny every actual reservation UPDATE. There is no public
schema/database creation or implicit public function execution in the governance
schema. Future objects require explicit review/grants. Migration owner remains a
separate setup credential and must never be injected into Render.

Only after approval, privately provision LOGIN/password for the control principal;
do not create it through provider role UI/API defaults that may add elevated
membership. Runtime requires that exact role and rejects owner, memberships,
object ownership, database/schema creation rights and unexpected grants. It uses
direct `pg.Pool`, max 3, bounded timeouts, verified server name/TLS, no libpq env
options, and one checked-out connection per transaction for locks/atomicity. URL
SSL options cannot override TLS verification. Only optional `sslmode=verify-full`
and the exact application_name are accepted query options. The CLI's default
`sslmode=require&channel_binding=require` URL is intentionally not a runtime URL;
`enableChannelBinding` requests SCRAM-PLUS when offered, **not mandatory channel
binding**. Source: [node-postgres TLS configuration](https://node-postgres.com/features/ssl).

No root row is initialized by setup/start/build or migration. Even successful
startup is not Founder Authority activation. Independent enrollment and real C
are still prerequisites for a usable root policy. Database/provider owners can
change infrastructure; this service alone cannot make those owners unbypassable.

## Validation and remaining gates

Local tests cover signed Auth0 and registry fixtures, first/second Action ordering,
proxy spoofing/unsafe CIDRs, secure configuration/secret-free startup failure,
real HTTP through the assembled engine/store contract, checkpoint/policy/role/MFA
denials, no bootstrap/execute, graceful resource ownership, and health behavior.
Disposable PGlite PostgreSQL tests actually apply all three SQL migrations,
exercise the grants/locking/immutable triggers, verify the runtime privilege probe
and prove customer-schema bootstrap rejection. These are local acceptance checks,
not a hosted Auth0/Render ceremony, hardware enrollment or independent audit.

Recorded command results:

```text
From governance/:
npm ci --ignore-scripts --include=dev --prefix control
  added 37 packages; audited 38 packages; found 0 vulnerabilities
npm run build --prefix control
  Governance server syntax build passed.
npm test --prefix control
  tests 20; pass 20; fail 0

From repository root:
npm test
  Test Files 93 passed (93); Tests 401 passed (401)
npm run lint -- --max-warnings=0
  exit 0
npm run build
  built successfully; unchanged index-CfvBoNr3.js / index-58SJVvnB.css
npm run check:build
  Build check passed: local HTML/CSS assets, title, header file and artifact exclusions.
```

Node 24.19.0 was verified and the control tests also ran directly using that
executable. Windows' global npm wrapper itself still invokes its installed Node
25.8.2, producing a nonfatal EBADENGINE warning during the exact clean-install
command; Render must use the specified Node 24 runtime. The customer Vite build
also emitted its existing >500 kB chunk advisory; it succeeded with identical
customer asset names. Neither warning was hidden or fixed by changing customer
code. The customer `.env.local` SHA-256 comparison remained unchanged; no hash or
secret content was printed. `git diff --check` passed.

Before deployment: independent review of the prepared source, explicit migration
approval and private runtime credential provisioning; real separate Auth0 client,
MFA enrollment and both Actions with token acceptance; independent authorization
producer/key/role/revocation operation; verified proxy ingress isolation; separately
controlled reviewed policy pin and checkpoint retention; hosted same-origin console
login integration; physical C and enrollment acceptance if activation is intended.
Separate checkpoint storage/cloud restore and action-specific provider enforcement
remain unresolved. None is silently replaced by customer Supabase, an owner DB
credential, a fabricated key or a permissive fallback.
