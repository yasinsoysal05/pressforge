#!/usr/bin/env bash
# Read-only checks for an Intel macOS Ventura PHP/MariaDB build machine.
set -uo pipefail
failures=0
report() { printf '%-32s %s\n' "$1" "$2"; }
check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then report "$1" "OK: $(command -v "$1")"; else report "$1" "MISSING"; failures=$((failures+1)); fi
}
echo 'PressForge Intel Ventura Build Host Doctor'
echo '======================================='
arch="$(uname -m)"
system="$(uname -s)"
version="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
report 'OS' "$system $version"
report 'CPU' "$arch"
if [[ "$system" != Darwin || "$arch" != x86_64 || "$version" != 13.* ]]; then
  report 'Target' 'FAIL: requires Intel macOS Ventura 13.x'
  failures=$((failures+1))
fi
for tool in python3 xcrun clang clang++ make cmake pkg-config bison curl tar shasum; do check_cmd "$tool"; done
if command -v python3 >/dev/null 2>&1; then
  python3 -c 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"' || failures=$((failures+1))
fi
if command -v bison >/dev/null 2>&1; then
  bison_ver="$(bison --version 2>/dev/null | head -n1)"
  report 'GNU bison' "$bison_ver"
  if ! printf '%s' "$bison_ver" | grep -Eq '[[:space:]]([3-9]|[1-9][0-9]+)\.'; then
    report 'Bison requirement' 'FAIL: GNU Bison >=3 required'
    failures=$((failures+1))
  fi
fi
if command -v pkg-config >/dev/null 2>&1; then
  for dep in openssl libxml-2.0 libcurl libzip oniguruma icu-uc icu-i18n; do
    if pkg-config --exists "$dep"; then report "pkg: $dep" "OK: $(pkg-config --modversion "$dep")";
    else report "pkg: $dep" 'MISSING (Ventura x86_64 dependency required)'; failures=$((failures+1)); fi
  done
fi
echo
if [[ "$failures" -eq 0 ]]; then
  echo '[OK] Source build preflight requirements are present.'
  echo 'NOTE: Existing library architecture and minOS must still be audited.'
else
  echo "[FAIL] $failures requirement(s) missing or incompatible."
  echo 'This script did not install or modify anything.'
  echo 'Prepare missing developer dependencies with a Ventura-compatible toolchain.'
fi
exit $((failures>0))
