# TiviLoom 0.6.5 source changes

- Version metadata updated to 0.6.5 / Android version code 65.
- Playlist wizard validation now reacts to input changes immediately and checks HTTP/HTTPS URL shape without requiring Enter or blur.
- Settings root has Application Information at the bottom and semantic icon mapping for settings categories.
- Mobile navigation slots use equal-width responsive layout and safe-area insets.
- Player action icon alignment and settings row spacing improved.

## Important release status
This is a source update, not an installable release. The requested native Media3 ExoPlayer migration remains blocked because the supplied project uses a custom Android packaging script and this workspace has no Android SDK/Gradle. npm dependencies could not be downloaded, so the bundled web app and LG IPK could not be rebuilt. See `RELEASE-0.6.5-STATUS.md`.
