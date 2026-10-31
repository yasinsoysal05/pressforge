#!/usr/bin/env bash
# Verify a finished DMG itself (not just the build directory).
# Read-only mount, no installation, no privilege elevation.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo '[FAIL] Intel macOS required to inspect DMG executables.' >&2
  exit 1
fi
case "$(sw_vers -productVersion)" in
  13.*) ;;
  *) echo '[FAIL] Run the release gate on actual Intel Ventura 13.x.' >&2; exit 1;;
esac

[[ "$#" -eq 1 ]] || { echo 'Usage: bash scripts/verify-final-dmg-macos.sh /absolute/path/to/PressForge.dmg' >&2; exit 2; }
dmg="$1"
[[ -f "$dmg" ]] || { echo "[FAIL] DMG missing: $dmg" >&2; exit 1; }

# Ensure the image itself can be read and passes disk-image checks.
hdiutil verify "$dmg"
mount_point="$(mktemp -d /tmp/pressforge-dmg-XXXXXX)"
mounted=0
cleanup() {
  if [[ "$mounted" -eq 1 ]]; then
    hdiutil detach "$mount_point" -quiet || echo "[WARN] Manual detach may be needed: $mount_point" >&2
  fi
  rmdir "$mount_point" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" -quiet "$dmg"
mounted=1
shopt -s nullglob
apps=("$mount_point"/*.app)
shopt -u nullglob
if [[ "${#apps[@]}" -ne 1 ]]; then
  echo "[FAIL] Expected exactly one .app inside DMG, found ${#apps[@]}" >&2
  exit 1
fi

python3 scripts/verify-app-bundle-macos.py --app "${apps[0]}"
echo '[OK] Mounted DMG has a complete portable Intel runtime and pinned WP-CLI.'
echo '[NOT VERIFIED] GUI launch on clean Ventura Mac; signing and notarization.'
