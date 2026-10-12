# LEQVOR Founder Root Authority

Superseded design: the user subsequently selected the 2-of-3 laptop/phone/recovery-device model. FOUNDER-AUTHORITY-V1.md is now the governing specification. The single-key protocol and offline inspector below are preparatory experiments only, not the final mesh implementation. Complete the preceding customer release/acceptance work before implementing or deploying founder authority. No dedicated USB key is mandated by the revised specification.

Status, 12 October 2026: architecture accepted; offline request inspection and signature-verification preparation implemented and tested. No production governance API, Founder Lock, founder key or hardware signing has been activated. The owner has no hardware key yet. This boundary is separate from account authentication, vault encryption, sharing, devices and Shield. It never grants access to vault plaintext.

## Trust boundary

Founder signing private keys stay on independently controlled hardware. The production application stores public information only. A local console imports a public request file, displays its exact action, exact target, effect, version and expiry, then requests a hardware signature over the displayed canonical bytes. No public console hostname or listening web server. Transfer can use removable media; permanent Internet access is unnecessary.

A stolen Supabase or Vercel account does not export the hardware private key. However, an administrator who controls the verifier, deployment or public-key registry can bypass verification or substitute a key. A database policy within that same administrator's control cannot prevent this. Effective enforcement therefore requires independently controlled deployment authority and an externally retained governance pin/checkpoint. Platform, repository, billing, domain and legal ownership cannot be transferred securely by application code alone.

The founder authorizer must run outside ordinary application-admin write permissions, reject unsigned mutation paths, and enforce every governance mutation. Protect repository branches and deployments with separately held credentials, restrict infrastructure roles and prohibit unilateral changes to the authorizer. Maintain offline copies of the public pin and audit checkpoints. A production database row is not an independent trust anchor. Independent review must verify both code paths and infrastructure authority before any protection claim.

## Version 1 packet

`scripts/founder-protocol.mjs` defines exact fixed-order UTF-8 JSON bytes with: domain, platform, action, target, request ID, 256-bit nonce, governance version, founder public-key fingerprint, phase, proposal hash, issued time and expiry. Platform is `leqvor.vercel.app`; domain is `leqvor-founder-governance-v1`. Requests expire within ten minutes. No descriptive alias can replace the exact account ID or SHA-256 target digest. Unknown fields, invalid dates, private key input and unbound confirmations are rejected.

P-256/SHA-256 is the preparatory verification format, with 64-byte IEEE P1363 signatures. The key fingerprint is SHA-256 of SPKI DER. Hardware integration must verify its actual signature encoding; DER output must be decoded and checked before converting. Do not sign a digest as if it were the original bytes, or double hash it. No hardware adapter is supplied yet and no ordinary website passkey is treated as the founder key.

Supported actions: transfer platform control, remove founder, rotate founder key, disable Founder Lock, change a root security policy and freeze governance. Exact policy/key digests must refer to a separately inspected artifact; a digest alone does not explain the effect. The console must show that artifact before signing policy changes or key rotation.

## Transactional execution requirements — not implemented yet

Signature verification alone is insufficient. The independent executor must atomically recheck the current trusted key, governance version, exact pending action/target, expiry and unused request/nonce, append the signed audit entry, consume the request and advance the version. Concurrent/replayed requests must have exactly one winner. Never accept a caller-supplied pin or permission claim. Request generation uses a cryptographically random nonce.

Transfer, removal, key rotation, disabling Founder Lock and root-security changes require two distinct hardware authorizations. Phase PROPOSE records a proposal without applying it. Phase CONFIRM must bind the exact signed proposal hash and identical action/target, use a fresh nonce/request, and execute only after a fixed 72-hour cooling interval measured by trusted executor time. It receives its own ten-minute signing window after cooling. Cancellation, any intervening version change or changed key invalidates confirmation. Early signing must not create an approval that becomes valid later. Governance freeze must be explicitly signed; unfreeze requires the reviewed two-phase root-security path.

Audit retains the signed proposal and confirmation, previous checkpoint, resulting version and execution outcome. Store independently retained checkpoints to detect server rewrites, truncation and forks. Call this tamper-evident, not tamper-proof. Do not use ordinary vault security history as the sole governance anchor.

## Offline inspector

Run `node scripts/founder-inspect.mjs <public-request.json>` on a trusted offline computer. It displays the validated effect and exact bytes/digest. It does not listen, fetch, generate or persist keys, sign, enroll a founder or execute anything. Its output is inspection only. Synthetic tests use disposable software keys solely to verify protocol handling; they do not establish hardware-backed acceptance.

## Activation blockers and acceptance

Obtain a primary hardware key and a separately stored backup key; choose a reviewed signing interface with touch/PIN requirements. Decide how both keys authorize and how loss is handled before pinning either. Never generate the production private key on disk or place it in Vercel/Supabase environment variables. No password/software-key fallback is authorized. Loss recovery cannot be both admin-bypassable and exclusive hardware authority; the owner must choose the recovery quorum explicitly.

Then implement and independently review the offline hardware adapter, two-phase executor, independent pin/checkpoints, migration of existing governance paths, and infrastructure ownership controls. Acceptance must cover actual hardware sign/verify, wrong action/target, stolen admin sessions, pin substitution, replay/concurrency, expiry, early confirmation, cancellation, rollback/fork detection, lost primary key and backup-key recovery. These remain open. No website UI redesign is part of this work.

Local validation: all 321 tests across 78 files passed after this addition; lint passed with zero warnings. The offline CLI was exercised with a synthetic public request. The existing production release remains cb76df3; these offline preparatory files are not connected to its API or website bundle.
