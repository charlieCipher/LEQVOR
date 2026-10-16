# Separate LEQVOR control-service boundary

Status: implemented and locally tested; **not listening, deployed or activated**. No customer UI or customer authentication setting changes. The separate admin view/client is implemented as an injected module; its live login/provider/hosting entry remains unfinished.

This package is deliberately separate from the customer Vite application and its dependency graph. `jose` 6.2.12 verifies access-token signatures using an independently configured HTTPS JWKS endpoint. It never decodes an unverified token into an administrator. See the [library's verification documentation](https://github.com/panva/jose).

## Identity contract

Configure a separate control identity provider/client. Do not reuse customer Supabase access tokens or accept ID tokens as API credentials. The provider must issue:

- Asymmetrically signed `RS256`/`ES256` access tokens with protected `typ: at+jwt` and exactly `aud: leqvor-control-console`.
- Pinned issuer; nonempty stable `sub` and unique `jti`; integer `iat`, `exp`, and actual last-authentication `auth_time` in Unix seconds. Lifetime must be at most five minutes.
- A provider-defined signed `acr` that has been verified to mean the required MFA. A password-only session is never fresh MFA simply because it was recently refreshed.

`isSessionActive({issuer,subject,token_id,expires_at})` is a mandatory **server-side live revocation adapter**, returning exactly true for an active session. Failure/unavailability denies access. Independently protected `lookupRole(subject)` must return an assigned supported role; JWT role claims, user-editable profiles and browser form fields cannot assign one. No default founder role exists. Role checks are performed on every request. Mutations additionally require MFA and actual authentication within five minutes.

Expiry and clock integrity are checked again after the live revocation lookup and after the gateway's role lookup. Mutations use that final time for MFA freshness. The gateway snapshots the submitted packet before asynchronous authentication so a caller cannot swap its action while authentication is pending.

The access-token issuance/login provider, revocation store and role directory are not configured. The package does not invent a provider-specific ACR mapping or expose a public login/bootstrap/reset endpoint. Review those concrete adapters before activation.

## Transport contract

`createControlServer` assembles a TLS 1.3 Node HTTPS server with the existing governance engine. It **does not call listen**. No production environment variables or secret files are read automatically. Supply a separate reviewed engine/datastore, configured identity, role lookup, TLS certificate/key and admission limiter. The TLS server key is an infrastructure identity, not a founder private key.

Only `POST /governance` is accepted. JSON is limited to 64 KiB, headers are bounded, encoded bodies and duplicate headers are rejected. Exact HTTPS Host/Origin and `Sec-Fetch-Site: same-origin` are required. No cookies or CORS are accepted; bearer tokens belong only in the Authorization header. The separate admin client obtains tokens from an injected configured control provider; the actual provider login ceremony is still to be built. TLS termination behind a proxy needs a reviewed adapter; arbitrary forwarded headers are not trusted.

`admit(req)` is mandatory and should implement bounded concurrency/rate limiting using trusted transport identity; do not trust forwarded caller IPs. Production denial-of-service load testing is pending. The listener has request/header timeouts and only one request per socket. Responses are no-store with a restrictive CSP. Errors return a generic message and request ID. `recordOutcome` receives only `{request_id,status}`; packets, tokens, target artifacts, provider errors and private material must never enter logs. Logging failure cannot retry a committed mutation.

Operations remain `read`, `request` and `approve`, through `GovernanceGateway`. The caller must submit an independently retained checkpoint. There is no execute/override/enroll/reset route. `AUTHORIZED` is not a provider execution receipt. Founder activation, native attestation enrollment, provider freeze/deployment enforcement and independent checkpoint storage remain separate unresolved requirements.

## Separate admin request workflow

`console-view.js` exports an accessible labelled DOM view and `console-client.js` exports its controller. Neither has an automatic browser entry, public listener or customer route. A reviewed hosting entry must provide a **separate HTTPS same-origin** address, independently obtained initial policy hash/checkpoint, and a control session adapter. The customer origin `leqvor.vercel.app` is explicitly rejected as a console origin. No hostname has been acquired or configured.

The session adapter must expose `getAccessToken({fresh})` and synchronous `clear()`. Mutations request fresh authentication; the server independently enforces the signed actual auth time and MFA. The adapter must cancel its own pending login/token acquisition when cleared. Do not implement token refresh as fresh MFA. Tokens are used only in the Authorization header, not URLs, cookies, localStorage, public JSON exports or logs. Fetch denies redirects and cookies, disables cache, bounds responses and aborts network waits.

Workflow:

1. Import `{policy,checkpoint,state}` against the independently supplied initial pins. Web Crypto validates public key fingerprints/types, complete state commitment and hash-chain history.
2. Read the pinned current state, or prepare a proposal/confirmation from a selected explicit action and complete **public** target artifact. The client verifies the returned action, target digest, phase/proposal binding, policy/version and expiry before exporting `{request,target}` for a local native signer.
3. After any mutation was sent, including an ambiguous network failure, the client blocks subsequent operations. It never retries a mutation or treats a response checkpoint as an independently trusted head. Advance by importing a new authority snapshot plus the matching `{checkpoint,approvals}` packet with two distinct valid founder checkpoint signatures. Existing audit prefixes must match; repeated heads, rollback and forks are rejected. The independently retained checkpoint process/storage is still required outside this view.
4. Import a native `{slot,key_id,signature}` approval and the exact target. The browser verifies its public signature against a pending request in the pinned state, then submits it for the server's independent verification. Both RSA and P-256 signatures use the same public canonical bytes as the native/Node protocol.

The view exports public verified JSON, displays JSON as text, escapes bidirectional controls for inspection, reports generic provider errors and clears imported/output state on background or explicit exit. Slow file reads/results cannot repopulate a cleared view. It never creates founder keys, asks for private keys, signs, assigns roles, executes provider actions or activates Founder Lock. A pending authorization result is not an executed operation.

No admin stylesheet/redesign was applied to the customer site. The view module is locally tested; visual/physical acceptance, secure static-asset hosting/CSP, actual login, role/revocation directory, provider execution, hardware attestation enrollment and independent review remain unfinished. Web Crypto key verification establishes the public signature, **not** hardware attestation or device independence.

### Commands

```powershell
npm ci --ignore-scripts --prefix governance/control
npm test --prefix governance/control
```

Seven tests cover real signed JWTs, issuer/audience/ID-token substitution, MFA freshness, token forgery, revocation outage, expiry during slow authorization lookups, invalid clocks, caller roles, HTTP origin/route/body/transport admission and secret-free failures. HTTP tests deliberately bind a disposable **loopback-only HTTP harness** with injected transport approval; the production factory accepts real TLS sockets only. Test signatures are ephemeral software fixtures; no real founder credentials are created.

CI installs this package separately with scripts disabled and runs these tests. No deployments, user accounts or infrastructure ownership changes occur.

The root test suite also includes eight `founder-console-client` and four `founder-console-view` checks. They use the real governance engine and ephemeral mixed public-key fixtures, including the proposal/cooling/confirmation flow, signed checkpoint advancement, domain/target substitutions, bounded responses and session/file-read races. These are module/DOM acceptance checks, not a hosted admin login or physical-device test. Java and .NET interoperability confirms the shared public encoding remains unchanged.
