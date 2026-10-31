#!/usr/bin/env bash
# Verify an Intel Ventura 13 build-host runtime before constructing a DMG.
# This only writes into the repository's ignored runtime build folder.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo "[FAIL] An Intel x86_64 macOS machine is required." >&2
  exit 2
fi

VERSION="$(sw_vers -productVersion)"
case "$VERSION" in
  13.*) ;;
  *) echo "[FAIL] This acceptance gate needs real macOS Ventura 13.x, found: $VERSION" >&2; exit 2;;
esac

: "${PRESSFORGE_PHP_PREFIX:?Set PRESSFORGE_PHP_PREFIX to the directory containing bin/php}"
: "${PRESSFORGE_MARIADB_PREFIX:?Set PRESSFORGE_MARIADB_PREFIX to the directory containing bin/mariadbd}"

for f in "$PRESSFORGE_PHP_PREFIX/bin/php" "$PRESSFORGE_MARIADB_PREFIX/bin/mariadbd" "$PRESSFORGE_MARIADB_PREFIX/bin/mariadb"; do
  if [[ ! -x "$f" ]]; then echo "[FAIL] Missing executable: $f" >&2; exit 2; fi
done
for tool in python3 otool install_name_tool file; do
  command -v "$tool" >/dev/null || { echo "[FAIL] Missing tool: $tool" >&2; exit 2; }
done

echo "[INFO] Intel Ventura $VERSION: staging PHP/MariaDB into PressForge resources"
python3 scripts/stage-runtime-macos.py
echo "[INFO] Checking staged PHP, WP-CLI and MariaDB binaries"
python3 scripts/verify-bundled-runtime.py
echo "[INFO] Auditing all Mach-O architectures, minOS versions, dylib links"
python3 scripts/audit-runtime-macos.py
echo "[INFO] Starting isolated MariaDB instance and verifying socket SQL"
python3 scripts/smoke-mariadb-macos.py

echo "[OK] Runtime validation passed on Intel Ventura $VERSION"
echo "[NEXT] Run bash scripts/build-intel-dmg.sh on the SAME host."
echo "[NOTE] Full WordPress GUI, clean-machine and notarization checks remain mandatory."
