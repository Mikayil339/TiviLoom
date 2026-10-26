# Verification — TiviLoom 0.6.4

24 October 2026.

## Automated source and bundle checks

103 JavaScript tests passed; zero failed/skipped. Raw output: test-output.txt. Compiled-bundle UI tests use JSDOM with mocked media; they are not decoding or screenshot tests.

New targeted cases verify first/repeated/switched phone channel taps stay in preview, explicit expand and Back, group drawer selection/backdrop/tab transitions, stable search input/cursor and IME composition, Series search routing, native Back event ordering and phone Channels list routing. Existing movie Play, Xtream movie/series/seasons/episodes, catch-up, PIN/rename/long OK, sidebar-right focus, diagnostics, storage migration and QR relay tests still pass.

## Android emulator

15 native emulator checks passed; zero failed. Raw output: android-test-navigation.txt (INSTRUMENTATION_CODE -1 = RESULT_OK). Environment: Android 11/API 30 AOSP ATD x86_64, WebView 83.0.4103.120, 320×640 portrait / 640×320 landscape.

Verified actual MotionEvent taps and native Back: first/repeated/switched channel selection stays in preview; bundled MP4 currentTime advances; explicit expand fills the video surface and Back restores preview; group drawer selection and scrim close; movie detail overlay/hit target and Back; series seasons/episodes; stable search input and series result routing; Settings → Playlists → Back stack; rotation and horizontal bounds; native loopback HTTP M3U import → durable save → reload → preview.

The test synchronizes hittable DOM targets and WebView visual callbacks, uses fresh fixture IDs to avoid prior resume state, and waits for reload completion. Text entry uses real WebView input events, not a real IME. ATD lacks the normal keyboard/SystemUI; physical keyboard/inset acceptance remains unverified. Drawing was explicitly enabled (debug.hwui.drawing_enabled=1) for screenshots. ATD disables hardware drawing by default; see https://developer.android.com/studio/test/managed-devices#atd .

21 screenshots are included under qa/android/screenshots. Screenshots were inspected for the phone guide, fullscreen video, movie detail, search, series dialog, settings and rotation. Screenshot coverage and exact limits are listed below; no blanket claim of every device/action combination is made.

The instrumentation APK is a separate test package. It runs against the real installed Activity/WebView, injects MotionEvent taps and Android Back keys, tests portrait/landscape bounds and uses bundled sample video plus a loopback HTTP M3U fixture. It seeds a deterministic library, so run only on a fresh disposable emulator, never on a phone containing personal playlists.

The first emulator attempt exposed unsupported CSS inset on WebView 83, shifting the phone canvas. Explicit edge fallbacks were added in shared TV/phone CSS. Search also inherited TV absolute coordinates; these were reset for the phone form. The emulator also exposed unsupported replaceChildren in modal close/back; compatible textContent/appendChild operations replace it, with a regression test that removes that API. Older WebView aspect-ratio and viewport-height fallbacks are included.

Reproduce with JDK 17, Android SDK platform/build-tools 35, emulator/platform-tools, and system image system-images;android-30;aosp_atd;x86_64. Set ANDROID_HOME, build the app with tools/build-android.sh and the separate runner with tools/build-navigation-test.sh, then tools/run-emulator-navigation.sh. Hardware acceleration is strongly recommended. No KVM was available on this host; software emulation is not a TV/phone performance benchmark.

## Package verification

APK: Android minimum API 26, target/compile API 35, version 0.6.4/code 64. Official apksigner verifies v2/v3 signatures. The personal signing identity matches 0.6.3. All 45 embedded web assets byte-match the final app directory. LG IPK is built by ares-package; packaged application assets match the same final app output. SHA-256 hashes are in SHA256SUMS.txt.

## Remaining acceptance work and limits

No physical phone or LG TV verification. Commercial provider playback/authentication/403, DRM/codec/audio/subtitle combinations, file picker, background/resume, real Wi-Fi phone-to-TV pairing and hardware mini-player behavior are not covered by the offline navigation fixture. Automated checks are targeted, not a claim that every action/device combination has been tested.

Provider 403 needs the actual failing URL/account/header requirements to diagnose conclusively. Reachability does not prove decoding. No DRM bypass or transcoding is provided. QR direct inbound LG LAN mode remains platform-dependent, with an outbound same-network computer/NAS relay supplied. Catch-up and Recently Added depend on provider metadata. EPG accepts up to 150 MiB decoded XML and retains a bounded 45,000 programme records.
