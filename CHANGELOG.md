# 0.6.4 — phone navigation and explicit fullscreen

- A phone channel tap, repeated tap or channel switch keeps playback in preview. Fullscreen uses the visible expand button; movie/episode Play retains its fullscreen route.
- Replaced unsupported replaceChildren calls in modal close/back with compatible operations, fixing menu/tab transitions on WebView 83 and Chromium 79.
- Android Back exits phone fullscreen in one step and preserves detail/dialog/drawer order.
- Group drawer selection, unlocked selection, backdrop and bottom tabs close the drawer predictably; TV sidebar behavior is preserved.
- Search updates only results, retaining the input node, cursor and IME composition. Series search results open seasons/episodes.
- Fixed phone search empty-state hit blocking and low-contrast input text; added explicit old-WebView icon spacing.
- Phone Channels list returns to the responsive guide instead of opening the TV three-column overlay.
- Fixed real Android 11/WebView 83 layout displacement: added explicit top/right/bottom/left fallbacks for unsupported CSS inset, aspect-ratio and viewport heights. Reset inherited TV search coordinates and render phone search as bounded rows.
- Added real Activity/WebView Android instrumentation with input injection, screenshots, orientation and native HTTP playlist import fixtures.
- Version 0.6.4/code 64 uses the same personal signing identity as 0.6.3.

Final verification: 103 JavaScript tests and 15 native Android emulator checks passed.

See TEST-REPORT.md for actual results and outstanding device/provider checks.

# 0.6.3 — source reconstruction and durable deliverables

Reconstructed from the retained 0.5.9 source and conversation's documented changes. This is not a claim that the missing 0.6.2 binary was recovered bit-for-bit.

- Reinstated reproducible Chromium 79 build, centralized 0.6.3 version and consistent About/manifests/installer.
- Added verified fallback library storage and useful save errors, preserving the existing database identity and legacy resume/folder key reads.
- Rebuilt signed Android phone host with native source/EPG bridge, local HTTPS origin, picker, lifecycle, Back/fullscreen and window insets.
- Reapplied bounded mobile layout, Series navigation, exact movie selection route, series season/episode metadata and stale-request guards.
- Reapplied worker parsing for large playlists, indexed favorites and 60-card media paging.
- Restored final-response diagnostics, M3U custom header parsing and per-origin Android media header handling.
- Rebuilt same-network outbound phone relay and optional Worker; retained TV direct mode as best effort.
- Recovered reference-guided 3D PNG wordmark and original app icon source; regenerated PNG exports and splash.
- Reinstated group unlock expiry, media surface stacking and existing security/storage regression coverage.

95 automated JavaScript tests passed. Native parser checks, APK v2/v3 signature and package integrity checks passed. Physical-device acceptance remains outstanding.
