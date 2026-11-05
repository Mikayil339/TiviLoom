# TiviLoom 0.6.15 — Android phone + LG webOS patch

This patch builds the phone hotfix on the released LG 0.6.11 baseline. Android TV work remains paused in the original checkout and is not included.

## Navigation and playback

- Preserve webOS warm-return section, modal stack and focus. Resume the previously playing channel only when visible and permitted; keep paused playback paused, including preview expansion. Revoke temporary PIN access on background transitions.
- Phone startup autoplay opens preview, never unsolicited fullscreen. Native preview/fullscreen keeps the same decoder.
- Refresh visible EPG cells, current programme selection and progress without replacing focused rows or open dialogs. Follow programme rollover after a dialog closes and advance an expired live guide window.
- Identify native selected channels by ID instead of display name.
- Normalize native search with the same Azerbaijani letter folding as web search. Index catalogues and filter large lists off the UI thread; debounce typing and reject stale results.
- Transfer the catalogue when opening a menu instead of serializing it on every channel switch. Cancel pending catalogue work on Back so delayed replies cannot reopen a menu.
- Keep the new native dialog active when an older More dialog finishes dismissing.
- Apply mute, fit and motion settings without replacing the active decoder. Monitor audio output as well as first video output before accepting startup as successful.

## UI and motion

- Adapt narrow fullscreen toolbars; retain search, channel list and history, with secondary controls available in More.
- Add interruptible control fades, consistent sheet entrance/exit motion, soft web modal closure, lightweight category scrim motion and shared navy/cyan surfaces.
- Respect app motion settings and Android animation settings. Keep expensive TV layout motion disabled while allowing lightweight overlay opacity.
- Improve volume/brightness HUD with an icon and meter, and show gesture help once.
- Add native channel logo caching, initial-letter fallbacks and now-programme metadata.
- Add checkable accessibility semantics to track choices and keep decorative logos out of screen-reader narration.
- Add an interface language selector and translate core menus and native player controls. Preserve provider channel, group, programme and movie metadata.

## Diagnostics, backup and reminders

- Offer selected-channel, category or all-channel HTTP diagnostics, cancellation and a bounded results view. Export only a redacted diagnostic report; this is not a codec certification test.
- Add active-playlist backup/restore access. Require explicit inclusion of provider/account data before exporting a restorable backup. Android uses the system document picker. webOS uses a local JSON panel because this build has no system file picker.
- Add opt-in Android programme notifications with permission handling, alarm cancellation and reboot restoration. Android may delay inexact reminders; webOS reminders remain in-app only.
- Explain unavailable multiview, recording, system PiP and audio offset rather than presenting dead controls as working features.
- Align package/service/web versions at 0.6.15; Android versionCode 75. Include source fingerprints in release metadata and About.

## Verification scope

Automated web/service/DOM checks, native compilation, signed package inspection and emulator acceptance results are recorded with the delivered artifacts. Native tests use an isolated emulator, a lightweight QA HOME activity and local media over adb reverse (tcp:18888). The QA HOME activity is part of the test APK only.

No physical LG or Samsung S23 Ultra acceptance is claimed. Codec/provider coverage, measured animation smoothness, long sessions and large-font/device combinations still need physical-device confirmation. Approved logo/splash artwork, focus-without-autoplay policy and removed QR/relay functionality are preserved.
