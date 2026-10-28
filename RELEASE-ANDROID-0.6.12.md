# Android 0.6.12 — player menus and predictable preview

The category sheet previously appeared clipped beneath the native preview. Native preview visibility now follows the current screen and category/modal state. Opening categories, Series or Search hides and pauses the preview. Returning to Live TV retains the decoder and remains paused until the user resumes it. These transitions do not start another stream.

Phone categories use a rounded navy sheet with cyan selection, a clear heading/close control, wrapping labels and independent scrolling. The fullscreen channel list, search, history, audio/subtitle choices and additional actions share branded native surfaces with selected states, bounded lists and empty states. Track selection and filtering retain the active player.

The preview has a separate pause/play control. Tapping its video also pauses/resumes; the corner expand control remains the explicit fullscreen action. Fullscreen transitions retain the current player.

In unlocked fullscreen playback, a deliberate vertical swipe in the right side adjusts media volume; the left side adjusts this window's brightness. Up increases and down decreases. A percentage indicator appears during adjustment. Horizontal movement, controls, open menus and screen lock do not trigger these gestures. Brightness returns to the prior window setting on fullscreen exit/release; the global system brightness setting is not written. No special brightness permission or cloud service is required.

The approved logo/splash and Android 0.6.11 broadcast extraction, fast-path buffers and bounded decoder recovery are retained. Focus-triggered autoplay and phone-to-TV pairing remain disabled/removed. Android version is 0.6.12/code72; LG/root stays 0.6.10. The native menus and gestures are Android features and have not been certified on a physical Samsung S23 Ultra or LG TV. Emulator verification and build reports are delivered with the APK; this is a personal debug-signed arm64 package.
