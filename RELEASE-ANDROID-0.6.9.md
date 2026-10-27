# TiviLoom Android phone 0.6.9

Android 8.0+ (API 26), target API 35. LG webOS package metadata remains 0.6.8; Android now has a separate release version.

## Changes

- Explicit fullscreen expansion now reaches the native Media3 player, after channel/group PIN checks.
- WebView preview playback is stopped and its source released before native playback, preventing simultaneous preview and fullscreen connections.
- Fullscreen native controls use vector icons, symmetric padding, centered images and at least 48 dp touch targets. Back/title, play/pause, VOD seek, audio, subtitles, fit/zoom/stretch and screen lock are available.
- Android 13+ Back callbacks are registered on the audio/subtitle dialogs themselves, so Back closes the active menu first.
- Controls respect system bars and display cutouts. VOD progress is draggable; unsupported seek controls are disabled. The controls stay visible when paused or a selection dialog is open.
- Audio focus, headphone disconnect, bounded network retry, decoder fallback and retry after an opening failure are handled. Muted playback, reconnect preference and basic display mode are passed from app settings to the native player. Background playback is paused, timers stopped and native decoder resources released; VOD position, track choices and pause intent survive a return.
- Existing playlist entry, phone file selection, search, groups and preview behavior are retained. Phone-to-TV transfer remains removed. Branding artwork is unchanged.

## Verification

- 98/98 JavaScript/DOM/service tests passed, including native fullscreen dispatch and releasing the WebView source.
- Android app and native test APK compiled successfully with Gradle 8.11.1 / AGP 8.10.0 / Java 17.
- APK metadata and v2 signature verification passed. The APK is personally installable and debug signed; it is not a Play Store release.
- The app and test APK installed successfully on an isolated Android 16 emulator.
- 9/9 native Android 16 emulator acceptance checks passed at 2316×1080 / density 420, matching the Galaxy S23 Ultra display aspect ratio. The checks cover playback, button bounds/icon centering, pause/resume, screen lock, VOD seek, display mode, audio and subtitle dialogs, and Back. A local 12-second MP4 with audio was used.
- Initial emulator system ANRs and the first fullscreen tutorial obstructed early runs; those runs failed and were not counted as successful acceptance. The harness now dismisses those informational system overlays and waits for actual UI state instead of short fixed sleeps.
- No physical Galaxy S23 Ultra or real provider playlist was available. These results do not establish live-channel startup speed, One UI behavior or universal codec compatibility.

A native test runner is included in android/instrumentation/src/com/tiviloom/mobile/test/NativePlayerTest.java. It checks first video output, landscape bounds, icon centering, touch sizes, pause/resume, lock/unlock, seek and Back using a local MP4. The final execution report records PASSED=9 FAILED=0.

## Rebuild

Run npm ci and npm run build, then Gradle assembleDebug in android/. The Android workflow uses platform 36 for compilation, targets API 35 and publishes the personal test APK. Debug signing identity may differ between build machines; signing keys stay private and must be preserved for consistent future updates.
