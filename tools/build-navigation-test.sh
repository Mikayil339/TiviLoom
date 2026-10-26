#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sdk="${ANDROID_HOME:?Set ANDROID_HOME}"
bt="$sdk/build-tools/35.0.0"
jar="$sdk/platforms/android-35/android.jar"
out="$root/android/out/instrumentation"
mkdir -p "$out/classes" "$out/dex" "$root/android/test-apk"
"$bt/aapt2" link -o "$out/unsigned.apk" -I "$jar" --manifest "$root/android/instrumentation/AndroidManifest.xml" --min-sdk-version 26 --target-sdk-version 35
find "$root/android/instrumentation/src" -name '*.java' > "$out/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$jar" -d "$out/classes" @"$out/sources.txt"
find "$out/classes" -name '*.class' > "$out/classes.txt"
"$bt/d8" --lib "$jar" --min-api 26 --output "$out/dex" @"$out/classes.txt"
python3 - "$out/unsigned.apk" "$out/dex/classes.dex" <<'PY'
import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED) as z:z.write(sys.argv[2],'classes.dex')
PY
"$bt/zipalign" -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
"$bt/apksigner" sign --ks "$root/android/signing/tiviloom-test.jks" --ks-key-alias tiviloom --ks-pass pass:android --key-pass pass:android --out "$root/android/test-apk/TiviLoom-navigation-test.apk" "$out/aligned.apk"
"$bt/apksigner" verify "$root/android/test-apk/TiviLoom-navigation-test.apk"
