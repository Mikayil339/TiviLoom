#!/usr/bin/env bash
set -euo pipefail
project="$(cd "$(dirname "$0")/.." && pwd)"
sdk="${ANDROID_HOME:?Set ANDROID_HOME to Android SDK}"
tools="$sdk/build-tools/35.0.0"
jar="$sdk/platforms/android-35/android.jar"
out="$project/android/out"
mkdir -p "$out/classes" "$out/generated" "$out/dex" "$project/android/app/src/main/assets/web" "$project/android/signing" "$project/apk"
cp -R "$project/app/." "$project/android/app/src/main/assets/web/"
"$tools/aapt2" compile --dir "$project/android/app/src/main/res" -o "$out/resources.zip"
"$tools/aapt2" link -o "$out/unsigned.apk" -I "$jar" --manifest "$project/android/app/src/main/AndroidManifest.xml" --java "$out/generated" --min-sdk-version 26 --target-sdk-version 35 --version-code 65 --version-name 0.6.5 -A "$project/android/app/src/main/assets" "$out/resources.zip"
find "$project/android/app/src/main/java" "$out/generated" -name '*.java' > "$out/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$jar" -d "$out/classes" @"$out/sources.txt"
find "$out/classes" -name '*.class' > "$out/classes.txt"
"$tools/d8" --lib "$jar" --min-api 26 --output "$out/dex" @"$out/classes.txt"
python3 - "$out/unsigned.apk" "$out/dex/classes.dex" <<'PY'
import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED) as z:z.write(sys.argv[2],'classes.dex')
PY
"$tools/zipalign" -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
key="$project/android/signing/tiviloom-test.jks"
if [ ! -f "$key" ]; then keytool -genkeypair -keystore "$key" -storepass android -keypass android -alias tiviloom -dname 'CN=TiviLoom Personal Test, O=TiviLoom' -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1; fi
"$tools/apksigner" sign --ks "$key" --ks-key-alias tiviloom --ks-pass pass:android --key-pass pass:android --out "$project/apk/TiviLoom-0.6.5-android.apk" "$out/aligned.apk"
"$tools/apksigner" verify --verbose "$project/apk/TiviLoom-0.6.5-android.apk"
