# Scheduled cleanup deployment

UPDATE: User explicitly requested cleanup remain disabled and backup destination remain pending. The cron configuration was removed and CLEANUP_ENABLED defaults to off. Enabling later requires explicit user direction, CLEANUP_ENABLED=true, server credentials, and re-adding the schedule. No active schedule is claimed.

Endpoint: GET /api/ciphertext-cleanup. Vercel schedule: daily at 00:00 UTC (05:30 India time; actual invocation timing depends on provider plan). Maximum function duration 60 seconds; up to five jobs with four-second request deadlines. A busy queue needs monitoring and later capacity adjustment.

Required Vercel Production environment variables, entered privately:
- CRON_SECRET: random secret, at least 32 characters.
- SUPABASE_URL: https://awdsyhxdnyfilnzamflt.supabase.co
- SUPABASE_SERVICE_ROLE_KEY: server-only project credential.

Never use VITE_ for either secret. Missing configuration returns 503 without accessing Supabase. Wrong/missing authorization returns 401 when configured. Errors never expose backend response details. Responses are no-store. The website rewrite excludes API paths so the function can run.

Only deletion-outbox jobs are processed; active records are not enumerated for deletion. Storage removal must succeed before the queue item is acknowledged. This does not implement orphan-upload reconciliation, backups, or restore testing. No production cleanup completion is claimed until an authenticated invocation is verified against a deliberately deleted test file.

Local validation: 17 focused cleanup/release tests, lint and release build/artifact checks passed. User sign-in and private server configuration are pending.
