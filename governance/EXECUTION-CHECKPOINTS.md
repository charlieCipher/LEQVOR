# Signed execution-history checkpoints

This separate domain covers the execution journal. A governance-state checkpoint does not cover it. This increment implements native A/B signing, two-founder assembly, immutable publication/read-back and an offline evidence restore. It is local software, not configured cloud retention or production enforcement.

Each checkpoint binds the independent three-key policy hash, execution idempotency key, complete reservation digest, event count, last event digest and observed journal status. Native consoles verify the complete bounded journal before displaying its fingerprint and signing the checkpoint with OS authentication. They require a separately imported root policy/snapshot and never accept a checkpoint as an execute approval. Signing domains differ from root actions, root-state checkpoints, replacement possession and isolated device tests.

The archive binds its independently retained predecessor digest. Advancing it requires two distinct valid current founder signatures, the same reservation and matching previous event prefix. Rollback, forks, cross-execution substitution and extension of terminal outcomes are rejected. This is a per-execution archive: it does not establish that an operator disclosed every execution. A global completeness/availability monitor and policy-rotation continuity remain separate work.

From the repository root:

```powershell
node governance/execution-archive-cli.mjs prepare independent-policy.json journal-snapshot.json new-native-input.json
# Import the independently retained authority in each native console first.
# Sign execution journal checkpoint; return only the public A/B exports.
node governance/execution-archive-cli.mjs assemble independent-policy.json public-A-checkpoint.json public-B-checkpoint.json new-signed-checkpoint.json
node governance/execution-archive-cli.mjs retain independent-policy.json journal-snapshot.json new-signed-checkpoint.json independent-execution-parent.json C:/explicit/retention-directory
node governance/execution-archive-cli.mjs restore independent-policy.json independent-execution-parent.json retained-sha256 C:/explicit/retention-directory new-evidence-restore.json
```

The initial parent is `{execution_key,archive_hash:null,checkpoint:null}` from the independently retained authorized operation identifier. Later parents are the verified retain output `{execution_key,archive_hash,checkpoint}` held independently. Never take the newest anchor solely from the archive/store being checked. Native imports are capped at 64 KiB; archives at 4 MiB and 100 events per execution. Larger history needs a reviewed archival design, not a skipped check.

The local filesystem adapter is not a separate cloud account, Object Lock or scheduled backup. Nothing is uploaded or deployed automatically. A separate immutable store and independent anchor distribution remain required. No real root policy containing the user's A/B keys and C is provisioned; synthetic acceptance keys do not stand in for that enrollment.

An `APPLIED` journal status plus two checkpoint signatures is **not independent provider proof**. Restore returns `provider_receipt_verified:false` and `execution_allowed:false`. Reconcile against a reviewed provider adapter and independently enforce live authorization at the provider effect. Restore never retries an ambiguous operation, changes SQL state, updates a root pin or revives revoked access. No signing private key or customer plaintext enters these files.
