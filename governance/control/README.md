# Separate LEQVOR control-service boundary

Status: implemented and locally tested; **not listening, deployed or activated**. No customer UI or customer authentication setting changes. The online admin UI/login ceremony remains unfinished.

This package is deliberately separate from the customer Vite application and its dependency graph. `jose` 6.2.12 verifies access-token signatures using an independently configured HTTPS JWKS endpoint. It never decodes an unverified token into an administrator. See the [library's verification documentation](https://github.com/panva/jose).

## Identity contract

Configure a separate control identity provider/client. Do not reuse customer Supabase access tokens or accept ID tokens as API credentials. The provider must issue:

- Asymmetrically signed `RS256`/`ES256` access tokens with protected `typ: at+jwt` and exactly `aud: leqvor-control-console`.
- Pinned issuer; nonempty stable `sub` and unique `jti`; integer `iat`, `exp`, and actual last-authentication `auth_time` in Unix seconds. Lifetime must be at most five minutes.
- A provider-defined signed `acr` that has been verified to mean the required MFA. A password-only session is never fresh MFA simply because it was recently refreshed.

`isSessionActive({issuer,subject,token_id,expires_at})` is a mandatory **server-side live revocation adapter**, returning exactly true for an active session. Failure/unavailability denies access. Independently protected `lookupRole(subject)` must return an assigned supported role; JWT role claims, user-editable profiles and browser form fields cannot assign one. No default founder role exists. Role checks are performed on every request. Mutations additionally require MFA and actual authentication within five minutes.

The access-token issuance/login provider, revocation store and role directory are not configured. The package does not invent a provider-specific ACR mapping or expose a public login/bootstrap/reset endpoint. Review those concrete adapters before activation.

## Transport contract

`createControlServer` assembles a TLS 1.3 Node HTTPS server with the existing governance engine. It **does not call listen**. No production environment variables or secret files are read automatically. Supply a separate reviewed engine/datastore, configured identity, role lookup, TLS certificate/key and admission limiter. The TLS server key is an infrastructure identity, not a founder private key.

Only `POST /governance` is accepted. JSON is limited to 64 KiB, headers are bounded, encoded bodies and duplicate headers are rejected. Exact HTTPS Host/Origin and `Sec-Fetch-Site: same-origin` are required. No cookies or CORS are accepted; bearer tokens belong only in the Authorization header. The same-origin admin frontend must obtain its token from the configured control provider and retain it in memory; that frontend/login ceremony is still to be built. TLS termination behind a proxy needs a reviewed adapter; arbitrary forwarded headers are not trusted.

`admit(req)` is mandatory and should implement bounded concurrency/rate limiting using trusted transport identity; do not trust forwarded caller IPs. Production denial-of-service load testing is pending. The listener has request/header timeouts and only one request per socket. Responses are no-store with a restrictive CSP. Errors return a generic message and request ID. `recordOutcome` receives only `{request_id,status}`; packets, tokens, target artifacts, provider errors and private material must never enter logs. Logging failure cannot retry a committed mutation.

Operations remain `read`, `request` and `approve`, through `GovernanceGateway`. The caller must submit an independently retained checkpoint. There is no execute/override/enroll/reset route. `AUTHORIZED` is not a provider execution receipt. Founder activation, native attestation enrollment, provider freeze/deployment enforcement and independent checkpoint storage remain separate unresolved requirements.

## Local verification

```powershell
npm ci --ignore-scripts --prefix governance/control
npm test --prefix governance/control
```

Six tests cover real signed JWTs, issuer/audience/ID-token substitution, MFA freshness, token forgery, revocation outage, caller roles, HTTP origin/route/body/transport admission and secret-free failures. HTTP tests deliberately bind a disposable **loopback-only HTTP harness** with injected transport approval; the production factory accepts real TLS sockets only. Test signatures are ephemeral software fixtures; no real founder credentials are created.

CI installs this package separately with scripts disabled and runs these tests. No deployments, user accounts or infrastructure ownership changes occur.
