# TiviLoom — LG webOS and Android phone

Android phone release: 0.6.11; LG webOS remains 0.6.10. Android preview and fullscreen share one native player host; unsupported platform formats use a LibVLC compatibility decoder. Android 0.6.11 accepts broadcaster non-IDR keyframes and bounds silent startup recovery. See RELEASE-ANDROID-0.6.11.md and RELEASE-0.6.10.md for scope and limitations.

## Install

Install the LG IPK through webOS Developer Mode / Device Manager. Keep the existing app installed when upgrading to preserve its local data. Add your playlist directly on the TV using Add playlist. The complete IPK includes both the app and its source-loading service.

Phone-to-TV playlist submission, QR pairing, local HTTP pairing, LAN relay, HTTPS Worker and the associated phone backup/restore path have been removed. No relay account, cloud deployment or running computer is needed for direct TV entry.

## Existing capabilities

Multiple saved playlists, M3U and Xtream source handling, groups, favorites, search, XMLTV guide data, provider-dependent catch-up, movies/series, parental/group PINs, remote actions, logo handling and saved navigation state remain in source. Availability and playback depend on the provider and target TV. Unsupported features are identified in the application's feature status.

Focusing a channel must not start automatic preview or change the playing stream. The approved logo and splash artwork are preserved. Startup no longer intentionally holds the splash for three seconds after data is ready.

## Build and validation

Use Node.js 22, then run:

```
npm ci
npm run build
npm test
npm run package
```

The LG workflow builds, tests and packages the IPK on main. The current package and webOS app/service version is 0.6.10; Android is 0.6.11. Android version metadata is maintained separately from the webOS package.

Local validation: 97/97 automated tests passed and the IPK packaged successfully. Tests dedicated to the removed transfer feature were removed; a new UI test verifies direct playlist entry and that focus navigation does not start playback.

Physical LG TV acceptance is not complete. Passing tests and a package build do not establish real-device performance, codec compatibility or flawless remote navigation.

See RELEASE-0.6.10.md and TIVIMATE-TELEVIZO-ANALYSIS-AZ.md. Older release/audit reports are historical and may describe removed functionality. Signing credentials must be managed privately and must not be included in repository documentation.
