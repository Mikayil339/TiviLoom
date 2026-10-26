#!/usr/bin/env bash
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
sdk="${ANDROID_HOME:?Set ANDROID_HOME}"
results="$root/android/emulator-results"
mkdir -p "$results"
# Keep the emulator, adb and test runner together; isolated build hosts may use
# a different network namespace for each shell invocation.
export ANDROID_HOME="$sdk"
adb="$sdk/platform-tools/adb"
"$adb" start-server > "$results/adb-server.txt" 2>&1
if [ ! -f "${ANDROID_AVD_HOME:-$HOME/.android/avd}/TiviLoomNav064.avd/config.ini" ]; then
printf 'no\n' | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd -n TiviLoomNav064 -k 'system-images;android-30;aosp_atd;x86_64' --force > "$results/avd-create.txt" 2>&1
fi
"$sdk/emulator/emulator" -avd TiviLoomNav064 -port 5556 -no-window -no-audio -no-boot-anim -no-snapshot -accel off -gpu swiftshader_indirect -memory 1536 -cores 2 -show-kernel > "$results/emulator.log" 2>&1 &
emulator_pid=$!
trap 'kill "$emulator_pid" 2>/dev/null || true; "$adb" kill-server >/dev/null 2>&1 || true' EXIT
until_time=$((SECONDS+480))
booted=0
while [ "$SECONDS" -lt "$until_time" ]; do
 if ! kill -0 "$emulator_pid" 2>/dev/null; then echo 'Emulator exited before boot'; break; fi
 "$adb" connect 127.0.0.1:5557 >> "$results/adb-connect.txt" 2>&1
 "$adb" devices > "$results/devices-current.txt" 2>&1
 boot="$(timeout 5 "$adb" -s emulator-5556 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
 if [ "$boot" = 1 ]; then booted=1; break; fi
 echo "Waiting for software Android boot: ${SECONDS}s"
 sleep 10
done
"$adb" devices > "$results/devices.txt" 2>&1
if [ "$booted" != 1 ]; then echo 'Android guest did not reach boot-complete; instrumentation NOT RUN.' | tee "$results/RESULT.txt"; exit 2; fi
"$adb" -s emulator-5556 shell settings put global window_animation_scale 0
"$adb" -s emulator-5556 shell settings put global transition_animation_scale 0
"$adb" -s emulator-5556 shell settings put global animator_duration_scale 0
"$adb" -s emulator-5556 shell input keyevent 82
"$adb" -s emulator-5556 install --no-incremental -r "$root/apk/TiviLoom-0.6.4-android.apk" > "$results/install-app.txt" 2>&1 || exit 3
"$adb" -s emulator-5556 install --no-incremental -r "$root/android/test-apk/TiviLoom-navigation-test.apk" > "$results/install-test.txt" 2>&1 || exit 3
"$adb" -s emulator-5556 shell dumpsys webviewupdate > "$results/webview.txt"
"$adb" -s emulator-5556 shell settings put system screen_off_timeout 1800000
"$adb" -s emulator-5556 shell input keyevent 224
"$adb" -s emulator-5556 shell wm dismiss-keyguard
"$adb" -s emulator-5556 shell setprop debug.hwui.drawing_enabled 1
"$adb" -s emulator-5556 shell wm size 320x640
"$adb" -s emulator-5556 shell wm density 160
timeout 480 "$adb" -s emulator-5556 shell am instrument -w -r com.tiviloom.mobile.test/com.tiviloom.mobile.test.NavigationTest | tee "$results/instrumentation.txt"
"$adb" -s emulator-5556 logcat -d > "$results/logcat.txt"
"$adb" -s emulator-5556 pull /sdcard/Android/data/com.tiviloom.mobile/files/navigation-tests "$results/screenshots" > "$results/pull-screenshots.txt" 2>&1
if rg -q 'TOTAL [0-9]+ passed, 0 failed' "$results/instrumentation.txt"; then echo 'Real Android navigation tests passed.' | tee "$results/RESULT.txt";else echo 'Real Android navigation tests had failures. Inspect instrumentation.txt.' | tee "$results/RESULT.txt";exit 4;fi
