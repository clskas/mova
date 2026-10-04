#!/usr/bin/env bash
# Patch Runner for passenger (cd.mova.mova) or driver (cd.mova.mova.driver) before flutter build ipa.
set -euo pipefail
FLAVOR="${1:-passenger}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
PBX="$ROOT/Runner.xcodeproj/project.pbxproj"
PLIST="$ROOT/Runner/Info.plist"

# Google Sign-In iOS OAuth client IDs (public). Override via env / GitHub secrets if rotated.
# Create in Google Cloud → APIs & Services → Credentials → iOS (bundle ID below).
GOOGLE_IOS_CLIENT_ID_PASSENGER="${GOOGLE_IOS_CLIENT_ID_PASSENGER:-58917716638-9qupcijrhjr7dvd5v1efmi9elitmndnd.apps.googleusercontent.com}"
GOOGLE_IOS_CLIENT_ID_DRIVER="${GOOGLE_IOS_CLIENT_ID_DRIVER:-58917716638-q5i6cr1hv085ri1k7tpot6sggvcv9qih.apps.googleusercontent.com}"

ios_url_scheme_from_client_id() {
  # 123-abc.apps.googleusercontent.com → com.googleusercontent.apps.123-abc
  local id="$1"
  local prefix="${id%.apps.googleusercontent.com}"
  echo "com.googleusercontent.apps.${prefix}"
}

if [[ "$FLAVOR" == "driver" ]]; then
  BUNDLE_ID="cd.mova.mova.driver"
  DISPLAY_NAME="Senga Driver"
  PROFILE='match AppStore cd.mova.mova.driver'
  ICON_SET="AppIcon-driver.appiconset"
  GOOGLE_IOS_CLIENT_ID="${GOOGLE_IOS_CLIENT_ID_DRIVER}"
else
  BUNDLE_ID="cd.mova.mova"
  DISPLAY_NAME="Senga"
  PROFILE='match AppStore cd.mova.mova'
  ICON_SET="AppIcon-passenger.appiconset"
  GOOGLE_IOS_CLIENT_ID="${GOOGLE_IOS_CLIENT_ID_PASSENGER}"
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

# Google Sign-In: GIDClientID + reversed client ID URL scheme (required on iOS).
if [[ -n "${GOOGLE_IOS_CLIENT_ID}" ]]; then
  GOOGLE_IOS_URL_SCHEME="$(ios_url_scheme_from_client_id "${GOOGLE_IOS_CLIENT_ID}")"
  if [[ -x /usr/libexec/PlistBuddy ]]; then
    /usr/libexec/PlistBuddy -c "Set :GIDClientID ${GOOGLE_IOS_CLIENT_ID}" "$PLIST"
    /usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 ${GOOGLE_IOS_URL_SCHEME}" "$PLIST"
  else
    perl -i -pe "s/GOOGLE_IOS_CLIENT_ID_PLACEHOLDER/${GOOGLE_IOS_CLIENT_ID}/g" "$PLIST"
    perl -i -pe "s/GOOGLE_IOS_URL_SCHEME_PLACEHOLDER/${GOOGLE_IOS_URL_SCHEME}/g" "$PLIST"
  fi
  echo "Google Sign-In iOS client=${GOOGLE_IOS_CLIENT_ID} scheme=${GOOGLE_IOS_URL_SCHEME}"
else
  echo "WARNING: GOOGLE_IOS_CLIENT_ID for flavor=${FLAVOR} unset — Google Sign-In will not work on iOS" >&2
fi

echo "iOS flavor=${FLAVOR} bundle=${BUNDLE_ID} name=${DISPLAY_NAME}"
