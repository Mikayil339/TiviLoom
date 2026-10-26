# TiviLoom 0.6.6 — Native Android player integration stage

- Added a Gradle Android build configuration with AndroidX Media3 ExoPlayer, HLS, and PlayerView dependencies.
- Added a native fullscreen Media3 playback Activity for explicit fullscreen playback on Android; ordinary channel taps continue to use the existing preview path.
- Native playback passes the stream URL, User-Agent, and Referer, follows HTTP redirects, uses bounded startup buffering, and displays playback errors.
- Added first-rendered-frame timing diagnostics in the native playback Activity.
- Added a Gradle pre-build task to refresh embedded WebView assets from the canonical `app/` directory.
- Version metadata updated to 0.6.6.

## Verification status
- JavaScript syntax checks passed for modified modules.
- Three source-level tests passed for Media3 dependency declarations, headers/buffering/diagnostics, and explicit-fullscreen routing.
- Android compilation and runtime playback have not been verified in this environment because Android SDK, Gradle, and ADB are not installed. Do not install or distribute this as a verified APK yet.
