#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo '[HATA] .dmg derlemesi yalnızca Intel macOS üzerinde destekleniyor.' >&2
  exit 1
fi

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
npm ci --no-audit --no-fund
export MACOSX_DEPLOYMENT_TARGET=13.0
npm run tauri build -- --target x86_64-apple-darwin

find src-tauri/target/x86_64-apple-darwin/release/bundle/dmg -maxdepth 1 -name '*.dmg' -print
printf '\n[UYARI] Bu DMG kod imzalama/notarization olmadan kamu dağıtımı için hazır değildir.\n'
