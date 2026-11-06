# AWS checkpoint integration — prepared, not activated

Bucket supplied by owner:
`leqvor-gov-checkpoints-533047842985-ap-southeast-2-an`, region `ap-southeast-2`.
After the owner privately signed in, live console inspection verified existence
in Sydney, Block ALL Public Access **On**, Bucket owner enforced / ACLs disabled,
Versioning **Enabled**, Object Lock **Enabled**, and SSE-S3 default encryption.
The bucket has **no policy**, no CORS configuration, no default retention and no
server access logging. Public access is blocked at the bucket level; this is not
a complete audit of every IAM identity/account administrator. No AWS write, IAM
grant, key creation, retention policy, upload or cloud restore has occurred.
IAM Roles inspection found nine existing AWS-managed/service/account roles and
no LEQVOR checkpoint or authorization signer role. Those existing roles were not
changed. Console account plan shows free-plan credits; no upgrade was selected.

## Runtime and least privilege

`s3-checkpoints.mjs` pins bucket/account/region, restricts keys to
`governance/archives/<SHA256>.json`, caps reads/writes at 4 MiB, uses SDK SigV4 and
SHA-256 checksums, AES256 server encryption, conditional If-None-Match `*`, object
version IDs, and explicit GOVERNANCE retention. It refuses unretained/unversioned
or corrupt read-back; 409/timeouts are reconciliation failures, never blind
automatic mutation retries. A 412 is accepted only after independent identical
byte/hash/checksum/retention read-back. Upload always verifies its returned version.
Receipts contain only digest, version, operation and retained-until date.

The adapter stores public signed governance metadata, not customer vault backups.
Existing root/execution archive signature domains remain unchanged. It cannot
create founder signatures or invent a checkpoint while C/enrollment is pending.

`aws-policy-plan.mjs` generates public IAM proposals from exact workspace,
environment and service IDs plus a mandatory approved maximum retention-day
bound, with no default duration or wildcard OIDC subjects. Writer permissions
are PutObject/PutObjectRetention on the archive prefix with conditional/encryption/
GOVERNANCE-mode constraints. Verifier permissions are GetObject/GetObjectVersion/
GetObjectRetention only. No deletion, retention bypass, bucket-policy editing,
root credentials or IAM administration is granted. These proposals must be
validated against the actual bucket policy and approved maximum retention period
before applying; no retention duration or IAM role was silently selected.

`connectFederatedCheckpointIdentity` uses an explicit `fromTokenFile` provider,
verifies temporary credential expiration and STS account/assumed-role/session,
and has no static-access-key or general credential-chain fallback. Each operation
uses bounded SDK requests. Independently reading requires a separately operated
reader identity and pin/head custody; two SDK objects in one compromised process
are **not** independent trust anchors. Do not load a verifier role or authorization
KMS signer into the governance control deployment.

## Render federation and cost gate

Observed workspace `tea-db8t11cs728c73avmdag` is **hobby**, one member. Render's
[managed AWS OIDC documentation](https://render.com/docs/oidc) requires **Pro or
higher**, an IAM OIDC provider `oidc.render.com/<workspace>`, audience
`sts.amazonaws.com`, exact subject
`workspace:<workspace>:environment:<environment>:service:<service>`, and
`AWS_ROLE_ARN`. Render injects/rotates `AWS_WEB_IDENTITY_TOKEN_FILE`; do not manually
invent it or substitute a long-lived access key. No service ID exists yet.
No upgrade or paid deployment was made. If Pro is not approved, another reviewed
temporary-credential hosting/federation design is required.

## Read-only restore

`node governance/control/s3-restore.mjs <independent-policy.json> <parent-anchor.json> <expected-digest> <new-output.json>`

Requires `LEQVOR_CHECKPOINT_VERIFIER_ROLE_ARN` and a privately provisioned
`AWS_WEB_IDENTITY_TOKEN_FILE`. Inputs are bounded public JSON. It validates
retention, object integrity, two-founder checkpoint signatures, policy and parent
anchor, then creates a new file without overwrite. It never changes a database,
policy pin, enrollment or active authority. The expected digest/latest head must
come from independent custody, not a mutable bucket `latest` object.

## Cloud acceptance still required

After private AWS sign-in: inspect all six bucket protections, actual owner and
policy, then prepare exact service trust/reader/writer roles. Obtain approval
before IAM changes or any retention/upload costs. Test disposable public signed
fixtures under a separately approved short GOVERNANCE retention, independently
download/restore, and verify denial of overwrite, delete and retention bypass.
Do not apply Compliance retention, broad trust, permanent keys or fake root keys.

Scheduling must only copy already signed, advancing packets and persist operation
receipts/independent anchors. The live scheduler and independently operated verifier
remain unconfigured. Local SDK doubles and archive tests are not cloud acceptance.
