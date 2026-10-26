# TiviLoom — audit status (2026-10-26)

- Original source version: **0.6.6**. Original archive contains **0.6.4** IPK/APK artifacts: these are excluded.
- Existing branding, logo and splash assets unchanged.
- No new focus-triggered preview behavior added. This has not yet received a dedicated regression test.
- Automation: existing GitHub Actions Android/webOS workflow retained with checksum generation and dual-artifact expectation.
- Static test run (without npm dependencies): **84 passed, 2 failed due to unavailable `fake-indexeddb` and `jsdom` packages**. Failures are missing dependencies, not confirmed product regressions. Run `npm ci && npm test && npm run build` in CI.
- Device validation and actual compilation of new APK/IPK remain unverified.
- Security: local Android signing key, old compiled binaries, temporary directories excluded from transfer.
- Do not publish this as a tested release yet.
