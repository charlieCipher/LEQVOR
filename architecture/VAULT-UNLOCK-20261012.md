# Vault unlock correction — 12 October 2026

User reported a failed unlock and asked whether passwords changed. No account or vault password was changed by this correction. An ordinary authenticated check of the known retained disposable fixture confirmed both its existing login and vault password still work; no password writes were performed. This is evidence about that fixture only, not the user's personal vault or entered password.

The existing secure-entry paragraph now identifies the signed-in email to distinguish accounts. A local decryption failure explains that the separate vault password is required and offers Reload vault, rather than implying Retry connection will correct a wrong secret. No raw exception or secret is displayed/logged. The layout, background, colors and stylesheet are unchanged.

Every existing-vault unlock now reads the current encrypted wrapper first, validates its owner and vault ID, and observes the Cold Lock generation before decryption. This prevents an old page from rejecting the correct new secret solely because another device updated the wrapper. Refresh failure or an unexpected vault prevents decryption. This does not replace, reset, normalize or recover passwords automatically.

Validation: 26 targeted tests across vault-gate, vault-password-controls and v5-security passed. New regressions cover refreshed wrapper use, foreign-owner denial, signed-in account context, decryption-failure copy and zero password mutation. Lint, production build/artifact checks and release configuration passed. Stylesheet remains index-58SJVvnB.css. Matching build entry index-CfvBoNr3.js. Hosted deployment acceptance is pending.

The offline founder preparation/specification from preceding local commits has no website/API integration or production authority. Founder mesh activation remains blocked by unverified device adapters, independent enforcement and remaining customer work.
