#!/usr/bin/env bash
# Fail CI if an AAB was built with the wrong Dart entrypoint / UI flavor.
# Usage: verify_aab_flavor.sh <driver|passenger> <path-to.aab>
set -euo pipefail

FLAVOR="${1:?flavor required (driver|passenger)}"
AAB="${2:?aab path required}"

if [[ ! -f "$AAB" ]]; then
  echo "::error::AAB introuvable: $AAB"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LIB="$TMP/libapp.so"

python3 - <<PY
import zipfile, sys
aab = r"""$AAB"""
out = r"""$LIB"""
with zipfile.ZipFile(aab) as z:
    name = "base/lib/arm64-v8a/libapp.so"
    if name not in z.namelist():
        sys.stderr.write(f"::error::libapp.so arm64 absent dans {aab}\n")
        sys.exit(1)
    with z.open(name) as src, open(out, "wb") as dst:
        dst.write(src.read())
PY

has() {
  local needle="$1"
  grep -a -F -q -- "$needle" "$LIB"
}

case "$FLAVOR" in
  driver)
    if ! has "Espace chauffeur"; then
      echo "::error::AAB driver sans « Espace chauffeur » — mauvais entrypoint ?"
      exit 1
    fi
    if ! has "MovaDriverApp"; then
      echo "::error::AAB driver sans MovaDriverApp"
      exit 1
    fi
    if has "Bienvenue sur SENGA"; then
      echo "::error::AAB driver contient « Bienvenue sur SENGA » (UI passager)"
      exit 1
    fi
    if has "MovaPassengerApp"; then
      echo "::error::AAB driver contient MovaPassengerApp"
      exit 1
    fi
    echo "OK flavor=driver → Espace chauffeur / MovaDriverApp"
    ;;
  passenger)
    if ! has "Bienvenue sur SENGA"; then
      echo "::error::AAB passenger sans « Bienvenue sur SENGA » — mauvais entrypoint ?"
      exit 1
    fi
    if ! has "MovaPassengerApp"; then
      echo "::error::AAB passenger sans MovaPassengerApp"
      exit 1
    fi
    if has "Espace chauffeur"; then
      echo "::error::AAB passenger contient « Espace chauffeur » (UI chauffeur)"
      exit 1
    fi
    if has "MovaDriverApp"; then
      echo "::error::AAB passenger contient MovaDriverApp"
      exit 1
    fi
    echo "OK flavor=passenger → Bienvenue sur SENGA / MovaPassengerApp"
    ;;
  *)
    echo "::error::Flavor inconnu: $FLAVOR"
    exit 1
    ;;
esac
