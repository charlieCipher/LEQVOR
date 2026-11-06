# Independent authorization service — local implementation

New files: `authorization-directory.sql`, `authorization-directory.mjs`,
`access-service.mjs`, `kms-authorization-signer.mjs`,
`authorization-runtime.mjs`, `authorization-start.mjs`.

This service is separate from the control API. Root Directory stays `governance`,
build is `npm ci --ignore-scripts --include=dev --prefix control && npm run build --prefix control && npm test --prefix control`,
start is `npm run start:authorization --prefix control`, Node 24.19.0,
health `/healthz` (liveness only). It must have separate operational ownership,
credentials, ingress and deployment approvals. Same code repository alone does
not provide independent operation. No service, database, KMS key or role is live.

## Persistence and administration

The prepared SQL refuses the governance/customer database: it requires database
`leqvor_authorization` with no founder_governance/auth/storage schema. Runtime
also rejects the governance Neon host and accepts only the reviewed different
Neon host, exact read-only role and certificate-verified TLS. Separate host is a
technical guard; independently controlled provider ownership must be established
operationally, not inferred from different database names.

Principals have explicit supported roles, default disabled. Sessions are explicit
five-minute maximum leases, bound to identity issuer/subject/jti/exact expiration.
There are no seeded users, default Founder, token-derived role writes or public
grant/revoke endpoints. The basic NOLOGIN reader has SELECT only; the separately
protected NOLOGIN operator can insert principals/leases, change role/enabled and
revoke leases. Neither owns objects or grants roles. Session expiration cannot be
extended by its UPDATE grants. Triggers increment revisions and append operator
events, whose updates/deletes/truncations are rejected. Owner/provider bypass is
still possible; external review and protected operator custody are necessary.

`createDirectoryLookup` joins role/session in one statement snapshot. Decision
issuance reads again after signing and rejects any role/revision/revocation change.
No cached successful decision is used. Public Auth0 access tokens cannot insert
rows. A valid Auth0 token for an unregistered lease is denied.

Operator provisioning must verify the Auth0 token signature/client/audience/MFA
and exact expiry privately before an explicitly reviewed lease insertion. No
unverified-token enrollment route is implemented. Signed operator administration,
session lifecycle automation, retention for expired lease records and independent
operator-account acceptance remain to be reviewed/provisioned.

## Signing and HTTP

KMS signer requires an immutable key ARN, ECC_NIST_P256 SIGN_VERIFY usage,
independently pinned public key, exact ES256 authorization JWT domain and temporary
credentials. It hashes signing bytes, requests ECDSA_SHA_256/DIGEST, verifies the
returned DER signature/key/algorithm and converts to JWT P1363 encoding. No PEM,
founder-key, KMS alias or local software fallback exists in production adapters.
Disposable software signing in tests is not founder enrollment or live KMS proof.

The HTTP service accepts only bounded POST `/live.jwt`, exact Host, reviewed
transport peers, JSON and scoped reader bearer. It denies browser Origin, cookies,
duplicate headers, encoding/transfer tricks, overload and unrecognized routes.
There is no role mutation or generic signing route. The existing issuer core
authenticates the reader hash and signs a fresh nonce/subject/jti/expiry decision.
Outages, unregistered/revoked sessions, signer changes and expiry deny access.

## Required server-only environment names

`NODE_ENV`, `NODE_VERSION`, `RENDER`, `PORT`, `RENDER_EXTERNAL_URL`,
`LEQVOR_AUTHORIZATION_ORIGIN`, `LEQVOR_CONTROL_ORIGIN`,
`LEQVOR_AUTH0_ISSUER`, `LEQVOR_RENDER_PROXY_CIDRS`,
`LEQVOR_AUTHORIZATION_DATABASE_URL`, `LEQVOR_AUTHORIZATION_DATABASE_HOST`,
`LEQVOR_AUTHORIZATION_READER_SHA256`, `LEQVOR_AUTHORIZATION_PUBLIC_JWK`,
`LEQVOR_AUTHORIZATION_KEY_SHA256`, `LEQVOR_AUTHORIZATION_KMS_KEY_ARN`,
`AWS_ROLE_ARN`, provider-injected `AWS_WEB_IDENTITY_TOKEN_FILE`.

The database URL is reader-only; KMS AWS role is authorization-service-only.
The control API receives only the scoped reader bearer and public verification
pin. Never give it the directory operator URL, authorization KMS identity or
founder private material. Secrets do not belong in VITE_, Git or chat.

Keep this unpublished until protected operator ownership, directory provisioning,
KMS/public pin ceremony, federation/plan approval, actual ingress isolation and
live role/revocation tests are complete. These controls do not make a sole
administrator who owns every provider independent from themselves.
