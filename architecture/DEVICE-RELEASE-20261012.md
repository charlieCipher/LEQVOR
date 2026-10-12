# Verified device release — 12 October 2026

User authorized testing, necessary fixes and deployment, then explicitly approved the exact three-migration batch at execution time. The preceding deployment hold is released for this increment.

Production baseline was read before mutation. Device registry and password guard were absent; direct vault UPDATE existed; all three business conflicts still used 40001. The tested record-sharing-conflict, verified-device and vault-password-guard migrations ran in one transaction. Supabase reported success. Readback confirmed vault_devices, replace_v5_vault_password, direct UPDATE denied, and all three conflicts corrected to PT409. No owner plaintext or recovery secret was queried or changed.

User-flow acceptance used the retained disposable account, never a personal vault. The earlier synthetic record/file creation was resumed: unlock, explicit reveal, decrypted attachment download and persisted title edit passed in the hosted browser. Browser input initially hit focus-loss Cold Lock; selecting the actual browser panel resolved it without weakening security. Download/reveal expiration concealed sensitive content as intended. This is not full mobile or two-account browser acceptance.

Review caught a release integration error: V5RecordDetail recognized 40001 but omitted PT409, leaving a stale detail view without the required reload state. Both conflict handlers now recognize either code. The regression test verifies concealment and explicit reload for both. The empty-vault Completion Score copy now directs users to document information instead of making a positive readiness claim. Layout, colors and CSS remain unchanged.

Validation: 317 tests across 77 files, PostgreSQL authorization/atomicity/isolation tests, encrypted disk restore, lint, dependency audit and production build/artifact checks passed. Release configuration passed. A new ordinary-user two-account hosted run passed vault creation/recovery, encrypted upload/download/reveal, edit/delete, stale revision rejection and cross-account record/file denial; its temporary accounts were removed and absence verified. These API tests are distinct from browser acceptance.

The matching code is ready for release. Confirm Vercel Ready and production-domain assignment, then test the deployed device endpoint and fresh-authentication workflow. General Shield, real passkey ceremonies, another-device recovery, separate cloud backups and independent review remain open.
