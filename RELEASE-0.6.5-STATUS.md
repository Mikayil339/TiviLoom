# TiviLoom 0.6.5 — source update and build status

## Implemented in source
- Bumped source/package/webOS metadata and Android build-script version to 0.6.5 / version code 65.
- Playlist wizard now validates on each input event and immediately updates Next/Done availability; HTTP(S) URLs are checked without requiring Enter or blur.
- Settings root no longer duplicates Application Information at the top; Application Information is at the bottom, with category-specific icon mappings.
- Added responsive mobile safe-area spacing, equal-width navigation slots, centered player action icons, and settings row alignment.

## Verification performed
- `node --check` passed for `src/app.mjs`, `src/tv-ui.mjs`, and `src/platform.mjs`.
- Source-level release regression tests added in `tests/release-065-source.test.mjs`.
- Existing Node test suite: 77 tests passed; 2 test files could not load because `fake-indexeddb` and `jsdom` are absent. This is not a full-suite pass.

## Release blockers — do not treat this as a finished installable 0.6.5
- The supplied 0.6.4 Android build is a custom `aapt2`/`javac`/`d8` script, not a Gradle project, and there is no Android SDK (`android.jar`, `aapt2`, `d8`, `apksigner`) or Gradle installed in this workspace. The requested Media3 ExoPlayer dependency cannot be integrated into a verified APK with that toolchain absent.
- `npm ci` could not complete because the package registry was unreachable; the required `esbuild`, webOS CLI, `jsdom`, and `fake-indexeddb` packages are not installed. Therefore the browser bundle and LG `.ipk` were not rebuilt.
- Native Media3 ExoPlayer playback has **not** been implemented or verified in this deliverable. Existing Android playback remains WebView/HTML5 based until a proper Gradle/Media3 migration can be built and tested.
- No new 0.6.5 APK or IPK is included. The old 0.6.4 APK is intentionally excluded from the release archive so it cannot be mistaken for the updated build.

## Next required build steps
1. Restore network access or provide cached npm dependencies and a supported webOS CLI.
2. Install Android SDK platform/build-tools and Gradle; migrate the Android host to a Gradle project with compatible `androidx.media3:media3-exoplayer`, `media3-exoplayer-hls`, and `media3-ui` dependencies.
3. Integrate a lifecycle-managed native PlayerView and secure bridge with the existing UI, then run emulator/device first-frame tests before packaging.
