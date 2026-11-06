# Cleanup activation verification

Checked 7 October 2026, approximately 03:08 IST.

- Production environment variable names were verified previously without revealing their values: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
- CLEANUP_ENABLED=true was added to Production and the daily schedule deployed in commit 60be109.
- Vercel's Cron Jobs page confirms Enabled and /api/ciphertext-cleanup scheduled at 0 0 * * * (UTC).
- The Hobby scheduling window corresponds to 05:30–06:30 IST daily.
- The deployed endpoint rejected an unauthenticated GET with HTTP 401. Vercel logs confirm this request at 2026-10-06T21:35:02.218Z.
- No successful authenticated execution was observed. The scheduled window had not arrived at the time of inspection. Service-role connectivity and successful queue processing remain unverified.
- The worker processes at most five queued ciphertext cleanup jobs per invocation; failed jobs remain queued for retry.
- Cloud backups and a cloud restore remain pending a separate storage destination. Cleanup is not a backup service.

Next verification: inspect the scheduled invocation's HTTP result and completed/failed counts after its run. Do not mark cleanup operational based solely on configuration or the unauthenticated 401 response.
