#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo '[HATA] .dmg derlemesi yalnızca Intel macOS üzerinde destekleniyor.' >&2
  exit 1
fi

# A distributable Ventura DMG must be built and exercised on Ventura,
# not on a newer macOS runner with incompatible system libraries.
host_version="$(sw_vers -productVersion)"
case "$host_version" in
  13.*) ;;
  *) echo "[HATA] Ventura hedefi için Intel macOS 13.x gerekir; mevcut: $host_version" >&2; exit 1;;
esac

for bin in node npm cargo rustc python3; do
  command -v "$bin" >/dev/null || { echo "[HATA] Build ortamında $bin eksik" >&2; exit 1; }
done

if [[ ! -f src-tauri/resources/runtime/tools/wp-cli.phar || \
      ! -x src-tauri/resources/runtime/php/bin/php || \
      ! -x src-tauri/resources/runtime/mariadb/bin/mariadbd || \
      ! -x src-tauri/resources/runtime/mariadb/bin/mariadb ]]; then
  echo '[HATA] Tam taşınabilir çalışma ortamı bulunamadı.' >&2
  echo '       Önce python3 scripts/stage-runtime-macos.py çalıştırın.' >&2
  exit 1
fi

# Avoid a misleading DMG with an incomplete runtime.
python3 scripts/verify-bundled-runtime.py
python3 scripts/audit-runtime-macos.py
python3 scripts/smoke-mariadb-macos.py
# A successful MariaDB boot is not enough: install an actual WordPress site,
# fetch its homepage and verify WP login before creating even a dev DMG.
python3 scripts/smoke-wordpress-macos.py
npm ci --no-audit --no-fund
export MACOSX_DEPLOYMENT_TARGET=13.0
npm run tauri build -- --target x86_64-apple-darwin

# Stage validation alone is insufficient: ensure the FINAL Tauri .app really
# contains relocatable Intel PHP/MariaDB and the pinned WP-CLI PHAR.
python3 scripts/check-native-macos-app.py
python3 scripts/verify-app-bundle-macos.py

# Validate the actual DMG image, not only the pre-packaging .app.
dmg_dir="src-tauri/target/x86_64-apple-darwin/release/bundle/dmg"
shopt -s nullglob
dmgs=("$dmg_dir"/*.dmg)
shopt -u nullglob
if [[ "${#dmgs[@]}" -ne 1 ]]; then
  echo "[FAIL] Exactly one DMG is required, found ${#dmgs[@]}" >&2
  exit 1
fi
bash scripts/verify-final-dmg-macos.sh "${dmgs[0]}"
printf '[OK] Development DMG verified: %s\n' "${dmgs[0]}"
printf '\n[UYARI] Bu DMG kod imzalama/notarization ve temiz Ventura testi olmadan kamu dağıtımı için hazır değildir.\n'
