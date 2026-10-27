# TiviLoom 0.6.8 — LG webOS

Removed phone-to-TV playlist submission, QR assets/dependency, polling, TV-local HTTP pairing, LAN relay, HTTPS Worker and phone backup/restore. Direct TV playlist entry and existing saved playlists remain. Android APK work is paused and Android version stays at 0.6.7.

Removed the artificial minimum 3-second splash hold after startup readiness. Approved logo and splash artwork are unchanged. No interface redesign or player-engine replacement is included.

Verification: build succeeded; 97/97 remaining and new regression tests passed; local installable IPK packaged successfully. The test count is lower than 0.6.7 because tests dedicated to the removed transfer feature were removed. A new compiled-UI test checks direct import, no phone entry points, immediate ready state and no playback from focus navigation.

Real LG TV acceptance has not been performed. Playback speed, focus behavior and codec support need physical-device checks. See TIVIMATE-TELEVIZO-ANALYSIS-AZ.md for research, evidence limits and the proposed interaction contract.

Old release/audit documents are historical records and may mention removed QR functionality. They are not current setup instructions. No relay deployment or account is required by this version.
