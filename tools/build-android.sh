#!/usr/bin/env bash
set -euo pipefail
project="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_HOME:?Set ANDROID_HOME to Android SDK}"
gradle_bin="${GRADLE_BIN:-gradle}"
(cd "$project" && npm run build)
(cd "$project/android" && "$gradle_bin" --no-daemon --max-workers=2 assembleDebug)
version=$(sed -n "s/.*versionName '\([^']*\)'.*/\1/p" "$project/android/app/build.gradle")
mkdir -p "$project/apk"
cp "$project/android/app/build/outputs/apk/debug/app-debug.apk" "$project/apk/TiviLoom-${version}-android.apk"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$project/apk/TiviLoom-${version}-android.apk"
printf 'Installable personal/test APK: %s\n' "$project/apk/TiviLoom-${version}-android.apk"
