#!/usr/bin/env bash
# Build-and-test developer entrypoint. NO sudo, no system database changes.
# Not a public release pipeline until signing/notarization and a clean-machine
# acceptance test are complete.
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  printf '%s\n' 'Usage: bash scripts/ventura-pipeline.sh --doctor|--build [--jobs N]' >&2
  exit 2
}
mode="${1:---doctor}"
shift || true
jobs=2
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --jobs)
      [[ "$#" -ge 2 && "$2" =~ ^[0-9]+$ ]] || usage
      jobs="$2"
      shift 2;;
    *) usage;;
  esac
done
[[ "$jobs" -ge 1 && "$jobs" -le 16 ]] || usage
case "$mode" in
  --doctor)
    bash scripts/doctor-ventura-build-host.sh
    python3 scripts/build-runtime-from-source.py --verify-lock
    echo 'Preflight only; no source packages downloaded or compiled.'
    exit 0;;
  --build) ;;
  *) usage;;
esac

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo '[FAIL] This distribution pipeline only supports Intel macOS.' >&2
  exit 1
fi
case "$(sw_vers -productVersion)" in
  13.*) ;;
  *) echo '[FAIL] Real Ventura 13.x build host required.' >&2; exit 1;;
esac

for bin in node npm cargo rustc; do
  command -v "$bin" >/dev/null || { echo "[FAIL] Missing developer build tool: $bin" >&2; exit 1; }
done

# Do not modify host-level PHP/MariaDB or their services.
bash scripts/doctor-ventura-build-host.sh
python3 scripts/build-runtime-from-source.py --build --jobs "$jobs"

build_dir="$PWD/.pressforge-build/ventura/dist"
export PRESSFORGE_PHP_PREFIX="$build_dir/php"
export PRESSFORGE_MARIADB_PREFIX="$build_dir/mariadb"

# Stages binaries and performs full local WordPress installation using a
# disposable MariaDB datadir and loopback-only PHP server.
unset PRESSFORGE_SKIP_WORDPRESS_E2E
bash scripts/verify-runtime-on-ventura.sh

# Does not publish or sign; outputs a local UNTRUSTED developer DMG.
bash scripts/build-intel-dmg.sh

echo
echo '[BUILT] Development-only DMG generated after local runtime tests.'
echo '[NOT VERIFIED] Clean Intel Ventura host without developer dependencies.'
echo '[NOT VERIFIED] Apple Developer ID signing / notarization.'
echo '[DO NOT RELEASE] Public distribution remains blocked until both gates pass.'
