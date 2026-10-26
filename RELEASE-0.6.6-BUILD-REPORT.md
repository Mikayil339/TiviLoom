# TiviLoom 0.6.6 — build-path and verification report
Date: 2026-10-24

## Source corrections completed
- Corrected the JavaScript version source and npm lockfile to 0.6.6.
- Corrected a malformed Java string literal in the native player bridge.
- Updated the stale release-version test to validate current package, webOS and Gradle metadata (4/4 pass).
- Added optional Android TV / Leanback launcher support while retaining mobile launcher support.
- Added `.github/workflows/release.yml`, which provisions Java and Android SDK, installs npm dependencies, runs tests, builds the web bundle, builds the Android APK, packages the LG webOS IPK, and uploads artifacts.
- Added `BUILD-ALL-PLATFORMS.md` with reproducible build steps and release gates.

## Test results in this environment
- `node --check` across 50 JavaScript source/service/test files: PASS.
- Release/source tests: 4/4 PASS.
- Dependency-independent tests: 83/84 pass before the release-version test was corrected; the version test now passes, so this set is expected to be 84/84 (run it again before shipping).
- Full `npm test` cannot complete because third-party packages `fake-indexeddb` and `jsdom` are not installed.
- No claim of real HLS first-frame rendering, real device playback, or physical TV validation is made.

## Why new binaries cannot be built in this runtime
This environment has Java 21 and Node 22 but no Gradle, Android SDK/platform `android.jar`, build-tools, ADB, or locally cached required npm packages. DNS resolution to `services.gradle.org` and `dl.google.com` fails, so SDK/Gradle downloads cannot be completed. A new APK or IPK therefore cannot be built here.

## Practical workaround to complete the build
The checked-in GitHub Actions workflow uses an internet-enabled GitHub runner. Commit this project to a Git repository, push it to GitHub, then run **Actions → TiviLoom Release Build → Run workflow**. It builds the APK and IPK and uploads them as artifacts. These remain release candidates until the APK is installed on Android phone/TV and an HLS stream is verified, and the IPK is installed and checked on webOS 6+.
