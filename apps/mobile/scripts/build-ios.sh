#!/usr/bin/env bash
# Build the iOS app and install it on a paired Apple device.
#
# Usage:
#   apps/mobile/scripts/build-ios.sh           # interactive picker
#   apps/mobile/scripts/build-ios.sh "iPhone"  # picks first match
#   apps/mobile/scripts/build-ios.sh <UDID>    # exact UDID
#
# Lists every paired-and-available iPhone/iPad reported by CoreDevice,
# lets you pick one (or pre-filter via the first arg), then runs
# xcodebuild + devicectl install.

set -euo pipefail

# --- Resolve repo root + iOS workspace -------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/../ios" && pwd)"
WORKSPACE="$IOS_DIR/AdvanceSeedsFieldInspector.xcworkspace"
SCHEME="AdvanceSeedsFieldInspector"
DERIVED_DATA_APP=~/Library/Developer/Xcode/DerivedData/AdvanceSeedsFieldInspector-ahvqozxoqyrdtegkjsgwmbspxoqr/Build/Products/Debug-iphoneos/AdvanceSeedsFieldInspector.app

# Signing — automatic with the Pongsakorn Pakkhemayang team. Override
# via env var if you need to build with a different developer team:
#   DEVELOPMENT_TEAM=ABC123 ./build-ios.sh
DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-5J6TSQ5MAN}"

# --- Discover devices ------------------------------------------------------
echo "→ Scanning for paired iOS devices…"
DEVICES_JSON=$(mktemp)
trap 'rm -f "$DEVICES_JSON"' EXIT
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null 2>&1 || true

# Filter to iPhone/iPad rows that are 'available' + 'paired'.
mapfile -t DEVICE_LINES < <(
  python3 - "$DEVICES_JSON" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
devices = data.get("result", {}).get("devices", [])
for d in devices:
    name = d.get("deviceProperties", {}).get("name", "?")
    model = d.get("hardwareProperties", {}).get("marketingName", d.get("hardwareProperties", {}).get("productType", "?"))
    udid = d.get("identifier") or d.get("hardwareProperties", {}).get("udid") or ""
    state = d.get("connectionProperties", {}).get("tunnelState", "?")
    paired = d.get("connectionProperties", {}).get("pairingState", "?")
    if not udid: continue
    if "Phone" not in model and "Pad" not in model: continue
    if paired != "paired": continue
    print(f"{udid}\t{name}\t{model}\t{state}")
PY
)

if (( ${#DEVICE_LINES[@]} == 0 )); then
  echo "✖ No paired iPhone/iPad found. Plug one in (USB) and trust this Mac, then re-run." >&2
  exit 1
fi

# --- Pick a device ---------------------------------------------------------
FILTER="${1:-}"
SELECTED_UDID=""
SELECTED_NAME=""
SELECTED_MODEL=""

if [[ -n "$FILTER" ]]; then
  # Pre-filter: match against UDID, name, or model (case-insensitive substring).
  for line in "${DEVICE_LINES[@]}"; do
    IFS=$'\t' read -r udid name model state <<<"$line"
    if [[ "$udid" == "$FILTER" ]] \
       || [[ "${name,,}" == *"${FILTER,,}"* ]] \
       || [[ "${model,,}" == *"${FILTER,,}"* ]]; then
      SELECTED_UDID="$udid"
      SELECTED_NAME="$name"
      SELECTED_MODEL="$model"
      break
    fi
  done
  if [[ -z "$SELECTED_UDID" ]]; then
    echo "✖ No paired device matched '$FILTER'." >&2
    exit 1
  fi
else
  echo
  echo "Available devices:"
  i=1
  for line in "${DEVICE_LINES[@]}"; do
    IFS=$'\t' read -r udid name model state <<<"$line"
    printf "  %d) %s — %s [%s]\n" "$i" "$name" "$model" "$state"
    ((i++))
  done
  echo
  read -rp "Pick (1-$((i-1))): " choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > i-1 )); then
    echo "✖ Invalid choice." >&2
    exit 1
  fi
  IFS=$'\t' read -r SELECTED_UDID SELECTED_NAME SELECTED_MODEL _state <<<"${DEVICE_LINES[$((choice-1))]}"
fi

echo "→ Building for: $SELECTED_NAME ($SELECTED_MODEL)"
echo "  UDID:        $SELECTED_UDID"
echo "  Team:        $DEVELOPMENT_TEAM"
echo

# --- Build -----------------------------------------------------------------
cd "$IOS_DIR"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -destination "id=$SELECTED_UDID" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  build

# --- Install ---------------------------------------------------------------
if [[ ! -d "$DERIVED_DATA_APP" ]]; then
  echo "✖ Built .app not found at $DERIVED_DATA_APP" >&2
  echo "  Check Xcode's DerivedData path or open the workspace in Xcode once." >&2
  exit 1
fi
echo
echo "→ Installing onto $SELECTED_NAME…"
xcrun devicectl device install app \
  --device "$SELECTED_UDID" \
  "$DERIVED_DATA_APP"

echo
echo "✓ Installed. Tap the icon on $SELECTED_NAME (unlock if needed) to launch."
