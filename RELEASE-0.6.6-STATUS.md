# TiviLoom 0.6.6 — build status

## Added
- Android Gradle project setup using Android Gradle Plugin 8.7.3, compile SDK 35, min SDK 26.
- Media3 ExoPlayer + HLS + UI dependencies pinned to 1.5.1.
- Native fullscreen playback Activity with provider User-Agent/Referer headers, redirect support, bounded startup buffering, player error feedback, and first-frame timing.
- Explicit fullscreen routing from the existing JS player into the native activity. Normal preview/channel taps do not launch fullscreen.
- Pre-build asset sync from the existing `app/` bundle.

## Tests run
- `node --check src/app.mjs` — passed.
- `node --check src/platform.mjs` — passed.
- `node --test tests/native-media3-source.test.mjs` — 3/3 passed.

## Blocking verification
- This environment has Java 21 but no `gradle`, Android SDK (`android.jar`, `aapt2`, `d8`, `apksigner`), or `adb`.
- AndroidX Media3 dependencies therefore could not be resolved and the APK could not be compiled or run. The native player is source-integrated but not build-verified.
- LG webOS package was not rebuilt in this stage; the existing webOS CLI and npm build dependencies are not available locally.
- No new APK/IPK is included, to avoid relabeling an old package as 0.6.6.
