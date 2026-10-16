# Customer build provenance — prepared, not activated

16 October 2026. The implementation is in the review branch. It has not been merged to main or run as a signed production build. It does not deploy, grant root authority, create keys, change customer UI or prove that Vercel deployed these bytes.

## Build and signing boundary

`release-provenance.yml` runs only through explicit manual dispatch on `charlieCipher/LEQVOR` main with the exact independently reviewed source commit supplied as an input. It does not run on pull requests or accept another ref. The build job has read-only repository access, no OIDC/attestation write permissions, no persisted checkout credentials and no deployment secrets. It runs the existing checks, then validates explicit public release configuration before packaging.

Configure repository Actions **variables**, never server secrets:

- `VITE_SUPABASE_URL`: the existing reviewed public backend origin.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: that project's public application key only. No service-role key or secret key.
- `VITE_ENABLE_PASSKEYS`: exactly the reviewed `true` or `false` value. An unset/empty value fails validation.

The candidate contains only checked customer output, its complete byte manifest and public build context. No governance source, device evidence, founder private material or backup contents are uploaded. The local verifier rejects changed/missing/extra files, unsafe paths, duplicate declarations, symlinks, invalid source/workflow bindings and capacity violations. Its result explicitly says `attestation_verified:false` and `deployment_authorized:false`: a caller can forge an unsigned JSON manifest/context.

A fresh second job downloads only the fixed-name archive from the same workflow run. It does not check out or execute customer code or install npm dependencies. Only this job receives short-lived OIDC and attestation-write permissions. GitHub's pinned `actions/attest` creates build provenance for the exact archive. The job then verifies its own attestation against repository, workflow, main ref and source/signer commit, denying self-hosted runners. No long-lived signing key is generated or stored. The uploaded candidate has 14-day Actions retention; that is **not** independent checkpoint storage or a cloud backup.

## Consumption

After independent review/merge and a successful authorized dispatch, download the candidate archive. Using a trusted GitHub CLI, first verify the complete archive with the independently reviewed commit in place of `COMMIT`:

```powershell
gh attestation verify leqvor-candidate.tar.gz --repo charlieCipher/LEQVOR --signer-workflow charlieCipher/LEQVOR/.github/workflows/release-provenance.yml --source-ref refs/heads/main --source-digest COMMIT --signer-digest COMMIT --deny-self-hosted-runners
```

Only after successful signature/identity verification, extract into a fresh isolated directory and check local bytes with a separately trusted reviewed copy of:

```powershell
node scripts/release-provenance.mjs verify ABSOLUTE_CANDIDATE_DIRECTORY COMMIT
```

Do not run scripts from an unverified archive. Do not infer trust from a filename, manifest, GitHub URL or a build-context claim alone. Prevent writes to the verified files before any separately authorized promotion; local checks do not eliminate a concurrent filesystem replacement by a privileged attacker.

## Still required

Actual hosted attestation acceptance is pending a reviewed merge, configured public variables and manual dispatch. No production signing success is claimed from local fixture tests. A compromised repository owner can change this workflow/settings, so its authority and an independently retained source digest remain part of the trust model. It is not a reusable independently controlled trusted builder or a validated SLSA-level claim. Vercel/provider-side exact-artifact promotion, root/freeze enforcement, independently verified deployment receipts and bypass testing remain unfinished integrations. The workflow intentionally has no deployment/provider credentials or promotion path.

References: [GitHub provenance generation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [GitHub CLI verification and identity constraints](https://cli.github.com/manual/gh_attestation_verify). Action versions are pinned to independently fetched official release commit IDs.

## Local validation

Twenty-one focused release/provenance/build checks passed, including seven new exact-candidate failure/acceptance tests and the actual prepare/verify CLI with synthetic public build context. The official actionlint 1.7.12 Windows archive was checked against its published SHA-256 checksums before running; the workflow passed static validation. This is workflow/schema validation, not a successful hosted OIDC signing ceremony. No cloud resources, account credentials, founder enrollment or deployment were created by these tests.
