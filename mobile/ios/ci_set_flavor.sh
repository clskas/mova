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
else
  BUNDLE_ID="cd.mova.mova"
  DISPLAY_NAME="Senga"
  PROFILE='match AppStore cd.mova.mova'
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
