# Authentication email investigation — 4 October 2026

## Confirmed cause and delivery check

Both user-authorized test accounts already have confirmed email addresses in production Supabase. The first was confirmed on 7 July 2026 and the second on 6 April 2026. Repeating signup does not establish that a new confirmation message was sent; the prior frontend message incorrectly implied that it did.

One signup resend request was accepted. A separate password-reset request to the first authorized test address was accepted, and the user explicitly confirmed receipt. Custom Gmail SMTP is configured. No SMTP credential, verification setting, account confirmation status, or MFA protection was changed.

This proves reset-email delivery to that inbox, not delivery of a new-account confirmation to an unconfirmed inbox. The unified log view did not return useful rows; it was not used as proof of delivery.

## Released fix

- Generic signup guidance now explains existing-account sign-in/reset and avoids promising delivery.
- Added confirmation resend through the authentication adapter, without requiring a password.
- Successful reset/resend requests impose a 60-second UI cooldown; server rate limits remain authoritative.
- Failures remain retryable and are not presented as success.
- Revision: `5ac607d404b943c75c017dc7c06184ea9ce8b924`.
- Vercel production deployment `Gt3ywzMLjM8cUXMFBurBn3Q15kyP` reported Ready; the live `/auth` page exposes the new confirmation option.
- Eight authentication tests, lint, and release build/artifact checks passed.

## Next dependency

The user was asked to sign in privately in the in-app browser for authenticated hosted vault testing. No password or recovery secret was requested in chat. Authenticated CRUD/isolation, cloud backup/restore, advanced security integrations, physical-device acceptance, and independent review remain unverified as recorded in LIVE-RELEASE-2026-09-29.md.
