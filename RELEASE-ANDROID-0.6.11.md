# Android 0.6.11 — broadcaster compatibility

Some live H.264 MPEG-TS streams stayed on the loading screen without reporting a player error. Captured samples from the affected broadcaster streams contain access-unit delimiters and non-IDR pictures, but no IDR pictures. Media3 documents this silent buffering case in its troubleshooting guide: https://developer.android.com/media/media3/exoplayer/troubleshooting .

The Android HLS and progressive TS extractors now allow non-IDR keyframes. Access-unit detection is not enabled globally because the examined samples already include delimiters. The existing fast-start buffer settings are retained.

Startup is checked against actual first-frame output. A silent startup can move from Media3 to LibVLC hardware decoding, then to software decoding, with a bounded wait per attempt. Successful compatibility modes are remembered in memory for up to 64 sources, avoiding repeated failed attempts when returning to those channels. Intentional pause and inactive views do not cause decoder switching. Old-player callbacks cannot replace a newly selected channel.

AudioTrack failures are included in compatibility recovery. Behind-live-window recovery is bounded. HTTP refusal reports a numeric status without exposing the private stream address. A provider 404 cannot be repaired by switching codecs.

The approved logo/splash, no-preview-on-focus behavior, fullscreen player identity and existing controls are preserved. Phone-to-TV pairing remains removed. LG webOS remains 0.6.10: this release changes Android native playback and does not establish LG playback compatibility.

Validation includes source tests and disposable Android emulator tests using actual rendered video/audio counters. The local non-IDR comparison disables audio to isolate video extraction. Live provider samples are supplied privately at runtime and are never committed. Emulator results are not Samsung S23 Ultra performance measurements. Physical Samsung and LG validation is still required; not every provider stream has been tested. The APK is a personal debug-signed arm64 build, not a Play Store release.

The source suite passed 98/98; non-IDR comparison 2/2; injected startup recovery 6/6; native controls 13/13; MainActivity/fullscreen checks with a live sample 6/6. A sequential 37-channel live sample passed displayed-video and decoded-audio checks for 36 channels, including ATV, Ictimai and AZTV. Naxcivan failed with HTTP404 on two attempts, while fresh manifest/segment probes returned HTTP200; a later playback retest passed. This intermittent result is retained as a limitation, not counted as a clean first-pass success. A separate Ayaz TV HD source returned HTTP404 and was excluded from the 37-channel playback sample. All 553 playlist channels have not been certified.
