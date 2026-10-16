# Founder Authority second self-review — 15–16 October 2026

Scope: control authentication/gateway, root execution authorization/coordinator, execution journal, root-state and execution archive validation, and associated tests. This is a targeted code review by the implementing agent, not an independent security audit or complete production acceptance.

## Corrected authorization timing gap

The gateway checked session expiry before awaiting the role directory. A slow lookup could return after token expiry while the gateway still used its earlier clock reading, including for read access and MFA freshness. The control authenticator similarly checked JWT time before waiting for live session revocation.

Both boundaries now recheck expiry after their final identity lookup. The gateway uses the final time for mutation MFA freshness; invalid and reversed clock readings deny access. The submitted packet and returned principal are copied before further asynchronous lookups so caller/adapter object mutation cannot replace the request or principal during those waits. These checks do not make remote role revocation atomic with a later provider operation; independent provider fences remain mandatory.

Regression cases cover expiry during role lookup for reads and mutations, MFA becoming stale during lookup, invalid/reversed clocks, packet replacement during authentication, expiry during live revocation, and the valid boundary just before expiry. They exercise the actual gateway and signed JWT verifier without real credentials or external mutations.

On 16 October, the focused gateway/executor/infrastructure regression passed 15 tests, and all seven separate control-service acceptance checks passed. Customer build and artifact checks passed with unchanged JS/CSS names. Full regression results must be read from the completed run rather than inferred from these focused checks.

## Remaining findings and dependencies

- Windows A evidence uses legacy SHA-1 attestation and lacks a fresh enrollment challenge. Strict enrollment remains blocked; no policy downgrade or TPM reset was made.
- Real A/B possession tests do not prove an independently enrolled three-device mesh. No physical C exists.
- Concrete separate admin identity/roles/datastore/hosting and independently fenced action-specific providers remain unconfigured or incomplete. No founder authority is active.
- Root-state and execution archives provide per-domain evidence. No independent cloud retention, scheduled cloud restore or policy-rotation continuity is claimed.
- Main branch protection was saved and read back. A repository owner can still change settings; Vercel/Supabase/provider controls and signed production provenance are not replaced by this rule.
- A separate qualified reviewer and real physical lifecycle/cooling/recovery/provider-bypass acceptance remain required. This self-review does not satisfy them.

No customer UI, vault password/encryption, device private key, production database permission or deployment is changed by this review.
