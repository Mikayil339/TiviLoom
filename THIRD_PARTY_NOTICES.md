# Android playback libraries

TiviLoom uses AndroidX Media3 1.5.1 and AppCompat 1.7.0 (Apache License 2.0) for the default Android player and track-selection dialogs.

When the platform cannot decode an advertised audio/video track, TiviLoom uses **VideoLAN LibVLC 3.7.6**, distributed under the GNU Lesser General Public License version 2.1 or later. It is loaded as shared native libraries, without modifications to LibVLC. The license is included in `app/assets/licenses/libvlc-COPYING.LIB.txt` and accessible from Android Application information.

- Official project and source: https://code.videolan.org/videolan/vlc-android
- Published library: https://central.sonatype.com/artifact/org.videolan.android/libvlc-all/3.7.6
- Java source artifact: https://repo.maven.apache.org/maven2/org/videolan/android/libvlc-all/3.7.6/libvlc-all-3.7.6-sources.jar
- LibVLC build instructions: https://github.com/videolan/vlc-android#build-libvlc

The complete TiviLoom Android sources and build configuration are in this repository. To replace or modify the library, change the `libvlc-all` dependency (or use a locally built equivalent), rebuild using `tools/build-android.sh`, and install the resulting APK signed with your own key. A signature change requires uninstalling the existing installation; export your playlist information first. No private signing key is required to build or replace the application.

The web interface uses Hls.js 1.6.16, Apache License 2.0, supplied with its package metadata.
