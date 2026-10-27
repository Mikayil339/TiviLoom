# TiviLoom 0.6.10 — Android and LG webOS

## Playback and controls

Android real channels now use a native player in both the preview frame and fullscreen. Expanding or returning changes the same host's bounds and orientation, without launching a second playback Activity or replacing the selected media. Audio/subtitle selection, fit, pause, VOD seek, lock and Back remain available. Search, channel list and history are restored as native panels, with previous/next channel, favorites, settings, sleep and mute in the additional-functions menu.

Channel selection from native panels goes through the existing JavaScript channel/group guards. Panels refresh their catalogue before opening and respect hidden channels/groups and locked-group visibility. No provider credentials or stream URLs are supplied to the selection panels.

Media3 remains the default engine. If a discovered audio/video track has no supported platform decoder, or a parser/decoder fails, the host switches once to VideoLAN LibVLC 3.7.6 for that channel. The compatibility engine also remains attached across preview/fullscreen transitions. It handles provider User-Agent/Referer metadata and shares the same controls. See THIRD_PARTY_NOTICES.md and Application information for license details.

## Layout fixes

- Preview expansion has an explicit 48 dp native target inside the preview frame; HTML fallback uses a centered 48 px box with no padding overflow.
- The startup autoplay switch retains a 42 × 24 track on phones and TV; its checked thumb stays inside that track.
- The shared settings icon uses a balanced vector within its viewport.
- The approved logo/splash and the prohibition on focus-triggered preview are preserved. QR/phone-to-TV submission remains removed.

## Build and validation scope

Android 8.0+ (API26), target API35. The phone distribution build targets arm64-v8a for Samsung S23 Ultra; x86_64 is used for the disposable emulator. The default Gradle build supports both 64-bit ABIs. `tools/build-android.sh` builds the arm64 personal/debug APK; use your existing matching signing identity for updates. This is not a Play Store production release.

The automatic JavaScript/DOM/service regression suite passed 98/98. APK and webOS IPK builds succeeded locally. A private provider sample reproduced an unsupported MPEG audio track with the platform engine; after the compatibility decoder was added, the AZTV sample passed displayed-video and decoded/selected-audio checks in the Android16 emulator. Representative manifests from all nine playlist categories were reachable (16 unique channels); this does not certify all 553 channels.

Native controls passed 13/13 checks; MainActivity with the private AZTV sample passed 6/6 checks, including decoder identity across repeated fullscreen transitions, channel panel continuity and both startup-switch states. The final compiled UI subset passed 15/15. Reports are delivered separately. Real Samsung S23 Ultra and real LG TV playback have not been tested. The LibVLC compatibility engine is Android-only; LG playback remains subject to the television's native codecs/browser engine. No relay deployment or account is required for the retained direct playlist entry workflow.
