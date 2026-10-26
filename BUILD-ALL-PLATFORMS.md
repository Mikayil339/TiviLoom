# Build TiviLoom for Android and LG webOS

## One-shot CI route (recommended for this network-restricted environment)
The workflow at `.github/workflows/release.yml` provisions Java, Android SDK, Node dependencies, runs tests, builds the Android APK, packages the LG webOS IPK, and uploads the artifacts. Put this project in a Git repository, push it to GitHub, then use **Actions → TiviLoom Release Build → Run workflow**. The workflow must complete green before artifacts are treated as release candidates.

## Local Android
Requirements: JDK 17, Android SDK platform 35, build-tools 35.0.0, network access to Google Maven/Maven Central and Gradle distribution.
```sh
npm ci
npm test
npm run build
cd android
gradle assembleDebug
```
APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Local LG webOS
Requirements: Node.js and npm, access to npm registry.
```sh
npm ci
npm run build
npm run package
```
IPK output: `ipk/*.ipk`.

## Release gate
Do not rename the existing 0.6.4 binaries as 0.6.6. Test the new APK on Android phone and Android TV, and install the IPK on webOS 6+ hardware or simulator. Confirm actual first-frame rendering on an HLS source and test channel switching, fullscreen, Back, playlist validation and remote focus before declaring the release production-ready.
