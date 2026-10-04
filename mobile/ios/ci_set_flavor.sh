#!/usr/bin/env bash
# Patch Runner for passenger (cd.mova.mova) or driver (cd.mova.mova.driver) before flutter build ipa.
set -euo pipefail
FLAVOR="${1:-passenger}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
PBX="$ROOT/Runner.xcodeproj/project.pbxproj"
PLIST="$ROOT/Runner/Info.plist"

if [[ "$FLAVOR" == "driver" ]]; then
  BUNDLE_ID="cd.mova.mova.driver"
  DISPLAY_NAME="Senga Driver"
  PROFILE='match AppStore cd.mova.mova.driver'
  ICON_SET="AppIcon-driver.appiconset"
else
  BUNDLE_ID="cd.mova.mova"
  DISPLAY_NAME="Senga"
  PROFILE='match AppStore cd.mova.mova'
  ICON_SET="AppIcon-passenger.appiconset"
fi

# Swap App Store / home-screen icon (ASC list icon comes from the IPA AppIcon).
ICON_SRC="$ROOT/Runner/Assets.xcassets/${ICON_SET}"
ICON_DST="$ROOT/Runner/Assets.xcassets/AppIcon.appiconset"
if [[ -d "$ICON_SRC" ]]; then
  # Only Icon-App-* (Contents.json); ignore any leftover flavor-prefixed PNGs.
  cp -f "$ICON_SRC"/Icon-App-*.png "$ICON_DST/"
  echo "AppIcon ← ${ICON_SET}"
else
  echo "WARNING: missing ${ICON_SRC} — AppIcon not updated" >&2
fi

# Only the app target uses PRODUCT_BUNDLE_IDENTIFIER = cd.mova.mova; (tests use .RunnerTests).
perl -i -pe "s/PRODUCT_BUNDLE_IDENTIFIER = cd\\.mova\\.mova(\\.driver)?;/PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};/g" "$PBX"
perl -i -pe "s/PROVISIONING_PROFILE_SPECIFIER = \"match AppStore cd\\.mova\\.mova(\\.driver)?\";/PROVISIONING_PROFILE_SPECIFIER = \"${PROFILE}\";/g" "$PBX"

if [[ -x /usr/libexec/PlistBuddy ]]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${DISPLAY_NAME}" "$PLIST"
else
  perl -i -0pe "s/(<key>CFBundleDisplayName<\\/key>\\s*<string>)[^<]+/\$1${DISPLAY_NAME}/" "$PLIST"
fi

# Keep CFBundleName aligned for ASC listing clarity.
if [[ -x /usr/libexec/PlistBuddy ]]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleName ${DISPLAY_NAME}" "$PLIST" || true
fi

echo "iOS flavor=${FLAVOR} bundle=${BUNDLE_ID} name=${DISPLAY_NAME}"
