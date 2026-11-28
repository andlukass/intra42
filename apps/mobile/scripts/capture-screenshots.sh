#!/bin/zsh
set -euo pipefail
unsetopt BG_NICE

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
mobile_dir="$repo_root/apps/mobile"
output_dir="$repo_root/output/mobile-screenshots"
frame="$mobile_dir/scripts/assets/iphone-17-frame.png"
port="${SCREENSHOT_METRO_PORT:-8093}"
metro_url="http://127.0.0.1:$port"
bundle_id="com.42go.intra"
scheme="intra42"
device_name="iPhone 17"

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: npm run screenshots:mobile"
  echo "Optional: SCREENSHOT_METRO_PORT (default: 8093)."
  echo "Saves framed iPhone 17 screenshots to output/mobile-screenshots/."
  exit 0
fi
[[ $# -eq 0 ]] || { echo "Unexpected arguments; see --help." >&2; exit 2; }
[[ "$port" == <1024-65535> ]] || { echo "Choose a Metro port from 1024 to 65535." >&2; exit 2; }
for tool in xcrun ffmpeg curl lsof node; do
  command -v "$tool" >/dev/null || { echo "$tool is required." >&2; exit 1; }
done
if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null; then
  echo "Port $port is already in use. Set SCREENSHOT_METRO_PORT to an unused port." >&2
  exit 1
fi

device="$(xcrun simctl list devices available --json | node -e '
  const fs = require("node:fs");
  const devices = Object.values(JSON.parse(fs.readFileSync(0, "utf8")).devices).flat();
  const candidates = devices.filter(device => device.name === process.argv[1] && device.isAvailable);
  const device = candidates.find(candidate => candidate.state === "Booted") ?? candidates[0];
  if (!device) {
    console.error("An iPhone 17 simulator is required.");
    process.exit(1);
  }
  console.log(device.udid, device.state);
' "$device_name")"
read -r device_id device_state <<< "$device"
if [[ "$device_state" == "Shutdown" ]]; then
  xcrun simctl boot "$device_id"
fi
xcrun simctl bootstatus "$device_id" -b
if ! app_container="$(xcrun simctl get_app_container "$device_id" "$bundle_id" data 2>/dev/null)"; then
  echo 'Install the Intra42 dev build first: npm run ios -- --device "iPhone 17" --no-bundler' >&2
  exit 1
fi

capture_dir="$(mktemp -d "${TMPDIR:-/tmp}/intra42-screenshots.XXXXXX")"
ready="$app_container/Documents/intra42-screenshot-ready"
metro_pid=""
cleanup() {
  if [[ -n "$metro_pid" ]]; then kill "$metro_pid" 2>/dev/null || true; fi
  rm -f "$ready"
  rm -rf "$capture_dir"
}
rm -f "$ready"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  cd "$mobile_dir"
  EXPO_PUBLIC_INTRA42_DEMO=1 EXPO_PUBLIC_INTRA42_SCREENSHOTS=1 EXPO_NO_TELEMETRY=1 CI=1 \
    exec node scripts/dev.mjs --port "$port" --localhost
) >"$capture_dir/metro.log" 2>&1 &
metro_pid=$!

echo "Waiting for the demo Metro server..."
for attempt in {1..60}; do
  if [[ "$(curl -fsS --max-time 1 "$metro_url/status" 2>/dev/null || true)" == "packager-status:running" ]]; then
    break
  fi
  if ! kill -0 "$metro_pid" 2>/dev/null || [[ "$attempt" == 60 ]]; then
    tail -30 "$capture_dir/metro.log" >&2
    echo "Metro did not become ready." >&2
    exit 1
  fi
  sleep 1
done

xcrun simctl terminate "$device_id" "$bundle_id" 2>/dev/null || true
xcrun simctl status_bar "$device_id" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState discharging --batteryLevel 100
trap 'xcrun simctl status_bar "$device_id" clear >/dev/null 2>&1 || true; cleanup' EXIT

encoded_metro_url="$(node -p 'encodeURIComponent(process.argv[1])' "$metro_url")"
run="$(date +%s)-$$"
count=0

wait_for_screen() {
  local receipt="$1"
  for attempt in {1..120}; do
    if [[ -f "$ready" ]] && grep -Fxq "$receipt" "$ready"; then return; fi
    sleep 0.5
  done
  tail -30 "$capture_dir/metro.log" >&2
  echo "Timed out waiting for $receipt." >&2
  exit 1
}

capture() {
  local name="$1" route="$2" link raw
  count=$((count + 1))
  local receipt="$run-$count"
  link="$scheme://$route?screenshot=$receipt"
  xcrun simctl openurl "$device_id" "$link"
  wait_for_screen "$receipt:$route"
  raw="$capture_dir/raw.png"
  xcrun simctl io "$device_id" screenshot "$raw"
  ffmpeg -loglevel error -y -i "$raw" -i "$frame" \
    -filter_complex "color=black@0:s=1350x2760,format=rgba[bg];[0:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(max(max(90-X,X-(W-91)),0),max(max(90-Y,Y-(H-91)),0)),90),255,0)'[rounded];[bg][rounded]overlay=72:69:format=auto[screen];[screen][1:v]overlay=format=auto,format=rgba" \
    -frames:v 1 "$capture_dir/$name.png"
  rm -f "$raw"
}

xcrun simctl openurl "$device_id" "$scheme://expo-development-client/?url=$encoded_metro_url"
wait_for_screen ready

capture home /
capture projects /projects
capture holy-graph /holy-graph
capture project-list /project-list
capture slots /slots
capture clusters /clusters

mkdir -p "$output_dir"
mv "$capture_dir"/*.png "$output_dir/"
echo "Screenshots saved to $output_dir/"
