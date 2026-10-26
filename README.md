# TiviLoom 0.6.4 — phone navigation fixes

This release reconstructs the application from the retained 0.5.9 source archive and the documented fixes in this conversation. It is a new build, not a byte-identical recovery of the lost 0.6.2 binaries. See TEST-REPORT.md for actual verification and limits.

Phone channel taps stay in preview. Use the visible expand button for fullscreen; Android Back returns to browsing. Search retains the keyboard/input node and Series results open the season/episode dialog.

## Android phone

Install `apk/TiviLoom-0.6.4-android.apk`. Minimum Android 8.0/API 26; target API 35. Keep Android System WebView updated. This is a signed APK containing a native Java Activity, packaged HTTPS asset origin, outbound native network/EPG bridge, system file chooser, native window/keyboard insets, Back handling and the shared phone interface. No broad storage permission is requested.

This uses a newly generated personal/test signing identity because the lost 0.6.2 keystore was not recoverable. If you installed that older APK, Android cannot update it with this different key. Do not delete an older installation containing important data without first preserving that data. The key included at `android/signing/tiviloom-test.jks` (alias tiviloom; password android) is retained for future personal updates, not suitable as a public-store production identity.

## LG webOS

Install `ipk/com.tiviloom.app_0.6.4_all.ipk` through LG Developer Mode. The TV app and service IDs remain unchanged. Do not uninstall the TV app before upgrading if you want to retain storage. Windows: extract the whole source ZIP, install Node.js 22+, then run `TV-ye qurasdir.cmd`. Other platforms: `node tools/install-tv.mjs`.

## Source build

`npm ci`, `npm run build`, `npm test`, `npm run package`.

Android: install JDK 17, SDK Platform 35 and Build Tools 35.0.0, set ANDROID_HOME, then run `bash tools/build-android.sh`. The script uses aapt2, javac, d8, zipalign and apksigner directly. Python 3 is used to assemble the APK ZIP. The compiled APK has no ABI-specific native dependencies. The native parser test in android/tests can be run on a JDK with a standard org.json JAR.

## Android navigation testing

The separate instrumentation runner and build scripts are in android/instrumentation and tools/build-navigation-test.sh. Run only against a disposable emulator: it seeds and replaces the test library. See TEST-REPORT.md for exact coverage, raw native results and screenshots.

## Important integrated behavior

- Phone Live TV / Movies / Series / Search, system playlist file picker, responsive cards, constrained forms/details and mini player. Media pages render 60 cards at a time.
- Movie detail Play binds the exact selected media ID. Xtream movie/series catalogs, seasons, episodes and meaningful resume offsets are integrated. Large M3U input uses a worker when allowed, with a tested compatibility fallback.
- Existing IndexedDB identity is retained. Rejected/blocked/timed-out database writes can use verified localStorage recovery; both-backend failures show error types and preserve previous saved data. localStorage has a smaller device quota than IndexedDB.
- Native Android EPG is streamed on a background thread, including selected local XMLTV files. 150 MiB decoded input and 45,000 retained programme records; no huge XML DOM is built on the phone UI thread. XML DTD/external entities are rejected.
- Group rename/PIN, protected-group filtering, five-minute unlock expiry, original guide virtualization and right-from-sidebar-to-groups behavior are preserved.
- Source checks use bounded GET/Range, follow redirects and report final HTTP status. A 403 identifies provider refusal, not a conclusive reason. Diagnostic reachability does not prove codec playback.
- Native Android subresource handling supports Range and configured per-origin User-Agent/Referer. Cross-origin redirects do not blindly receive another origin's Referer. Native media pipeline behavior still depends on device/WebView/provider. No DRM bypass, transcoding or access-control bypass is included.

## Phone-to-TV QR

Direct TV LAN serving is best effort and may be restricted. If it fails, run `node tools/lan-relay.cjs` on a same-network computer/NAS; keep it running during pairing. Enter its URL and bridge code in TV Settings → General → Phone pairing connection. Reopen QR, scan, send, confirm on TV. This fallback stays on the LAN and needs no cloud account. Router isolation/firewalls can still block it.

An optional user-owned HTTPS Worker is included at cloudflare/worker.mjs; bind a KV namespace as SESSIONS and deploy it yourself. Enter its HTTPS root with an empty bridge code. No cloud service has been deployed for you. KV is eventually consistent. Cloud pairing supports playlist submission, not backup/restore.

## Branding and media boundaries

Retained 3D PNG logo masters were recovered and exported into the application; no new flat replacement was drawn. PNG logo, icons in 80/130/400/1024 and static Full HD splash are included under branding. The original designer's layered source is not supplied. Catch-up needs an explicit provider template and available EPG; Recently Added needs timestamps; M3U series grouping needs recognisable episode metadata. Audio/subtitles require exposed tracks.

No physical Android phone, LG TV or usable simulator/emulator was available for acceptance testing. Package build/signature verification and automated DOM/service tests do not establish smooth video decoding, exact screen geometry or every-device compatibility.


## LG-only maintenance (0.6.7)

The LG webOS release workflow builds and tests only the IPK. Android APK builds are paused. The app icon references use versioned filenames to help refresh launcher metadata after an update; existing branding and splash artwork remain unchanged. On LG webOS, direct inbound HTTP servers are unsupported, so phone-to-TV QR pairing needs a user-controlled HTTPS Cloudflare Worker (computer-free) or LAN relay (PC/NAS). Do not claim QR transfer works without configuring a relay. Keep the old installed app and settings; do not uninstall before upgrading unless data is backed up.
