#!/usr/bin/env python3
"""Fail the release build if Tauri did not actually bundle the portable runtime.

Runs on an Intel macOS host AFTER 'npm run tauri build'. It checks the final
Contents/Resources/runtime path rather than trusting the staged source tree.
Real Ventura app start, signing and notarization remain separate acceptance gates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

REPO = Path(__file__).resolve().parents[1]
APPDIR = REPO / "src-tauri/target/x86_64-apple-darwin/release/bundle/macos"
REQUIRED = (
    "php/bin/php",
    "tools/wp-cli.phar",
    "mariadb/bin/mariadbd",
    "mariadb/bin/mariadb",
)


def fail(message: str) -> None:
    raise SystemExit("[FAIL] App bundle: " + message)


def main() -> None:
    if sys.platform != "darwin" or os.uname().machine != "x86_64":
        fail("This validation must run on Intel macOS")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path,
                        help="Override the built .app path, e.g. a read-only mounted DMG")
    args = parser.parse_args()
    if args.app is not None:
        app = args.app.expanduser().absolute()
        if not app.is_dir() or app.suffix != ".app":
            fail(f"Invalid mounted app path: {app}")
    else:
        apps = sorted(APPDIR.glob("*.app"))
        if len(apps) != 1:
            fail(f"Expected one .app in {APPDIR}, found {len(apps)}")
        app = apps[0]
    info = app / "Contents/Info.plist"
    if not info.is_file():
        fail("Missing Contents/Info.plist")
    with info.open("rb") as fp:
        manifest = plistlib.load(fp)
    if manifest.get("CFBundleIdentifier") != "dev.pressforge.desktop":
        fail("Unexpected bundle ID; refusing to validate wrong app")

    runtime = app / "Contents/Resources/runtime"
    if not runtime.is_dir():
        fail(f"Runtime is not under expected Tauri Resources directory: {runtime}")
    for item in REQUIRED:
        path = runtime / item
        if not path.is_file():
            fail(f"Missing in built .app: {item}")
        if item != "tools/wp-cli.phar" and not os.access(path, os.X_OK):
            fail(f"Bundled executable is not executable: {item}")
    install_db = runtime / "mariadb/scripts/mariadb-install-db"
    if not install_db.is_file():
        install_db = runtime / "mariadb/bin/mariadb-install-db"
    if not install_db.is_file():
        fail("Missing MariaDB database initializer")

    digest = hashlib.sha512((runtime / "tools/wp-cli.phar").read_bytes()).hexdigest()
    pinned = json.loads((REPO / "runtime-lock.json").read_text())["wp_cli"]["sha512"]
    if digest != pinned:
        fail("Bundled WP-CLI does not match pinned SHA-512")

    for path in runtime.rglob("*"):
        if path.is_symlink():
            resolved = path.resolve()
            if not resolved.is_file() and not resolved.is_dir():
                fail(f"Dangling symlink: {path}")
            if not resolved.is_relative_to(runtime.resolve()):
                fail(f"App bundle symlink escapes Contents/Resources/runtime: {path}")

    # Reuse the same fail-closed Mach-O audit with the final .app resource path.
    env = os.environ.copy()
    env["PRESSFORGE_RUNTIME_DIR"] = str(runtime)
    result = subprocess.run(
        [sys.executable, str(REPO / "scripts/audit-runtime-macos.py")],
        env=env, text=True, check=False,
    )
    if result.returncode:
        fail("Bundled Mach-O architecture, minOS or dylib audit failed")

    print(f"[OK] Actual app bundle: {app}")
    print("[OK] PHP/MariaDB/WP-CLI binaries exist inside .app Resources")
    print("[OK] WP-CLI checksum, symlinks and Mach-O audit")
    print("[NOT VERIFIED] Ventura GUI, clean-machine launch, Apple signing/notarization")


if __name__ == "__main__":
    main()
