#!/usr/bin/env python3
"""Validate macOS Intel Tauri .app build without claiming Ventura or WP compatibility.

This script intentionally checks ONLY the app executable. Every bundled Mach-O
dependency also needs Ventura minimum-version validation before DMG distribution.
"""
from __future__ import annotations

import os
import plistlib
from pathlib import Path
import re
import subprocess
import sys

TARGET = (13, 0, 0)
ROOT = Path(__file__).resolve().parents[1]
BUNDLE_DIR = ROOT / "src-tauri/target/x86_64-apple-darwin/release/bundle/macos"


def fail(message: str) -> None:
    raise SystemExit("[FAIL] " + message)


def run(*args: str) -> str:
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode:
        fail(f"{args[0]} failed: {result.stderr[:500]}")
    return result.stdout


def version(value: str) -> tuple[int, int, int]:
    parts = [int(x) for x in value.split(".")]
    if len(parts) > 3:
        fail(f"Invalid macOS minimum version: {value}")
    return tuple((parts + [0, 0, 0])[:3])


def main() -> None:
    if sys.platform != "darwin" or os.uname().machine != "x86_64":
        fail("Run this checker on the Intel macOS build runner")

    apps = list(BUNDLE_DIR.glob("*.app"))
    if len(apps) != 1:
        fail(f"Expected exactly one native app in {BUNDLE_DIR}, got {len(apps)}")

    app = apps[0]
    info = app / "Contents/Info.plist"
    if not info.exists():
        fail("Missing Info.plist")
    with info.open("rb") as handle:
        plist = plistlib.load(handle)

    executable_name = plist.get("CFBundleExecutable")
    if not isinstance(executable_name, str) or not executable_name:
        fail("Missing CFBundleExecutable")

    binary = app / "Contents/MacOS" / executable_name
    if not binary.is_file():
        fail(f"Missing macOS executable: {binary}")

    kind = run("file", "-b", str(binary))
    if "Mach-O" not in kind or "x86_64" not in kind:
        fail(f"Not an Intel Mach-O executable: {kind}")

    min_versions: list[tuple[int, int, int]] = []
    lines = run("otool", "-l", str(binary)).splitlines()
    for idx, line in enumerate(lines):
        name = line.strip()
        if name == "cmd LC_BUILD_VERSION":
            for part in lines[idx:idx+10]:
                found = re.search(r"\bminos\s+(\d+(?:\.\d+){1,2})", part)
                if found:
                    min_versions.append(version(found.group(1)))
                    break
        elif name == "cmd LC_VERSION_MIN_MACOSX":
            for part in lines[idx:idx+8]:
                found = re.search(r"\bversion\s+(\d+(?:\.\d+){1,2})", part)
                if found:
                    min_versions.append(version(found.group(1)))
                    break

    if not min_versions:
        fail("No supported minimum macOS load command found in the executable")
    if max(min_versions) > TARGET:
        fail(f"Binary requires macOS {max(min_versions)}, wanted <= {TARGET}")

    plist_min = plist.get("LSMinimumSystemVersion")
    if plist_min and version(plist_min) > TARGET:
        fail(f"Info.plist requires macOS {plist_min}; expected <= 13.0")

    print(f"[OK] App: {app.name}")
    print(f"[OK] Architecture: {kind}")
    print(f"[OK] Executable minimum macOS: {min_versions}")
    print(f"[OK] Info.plist minimum: {plist_min or 'not specified'}")
    print("[NOT TESTED] macOS Ventura 13 runtime execution")
    print("[NOT TESTED] PHP, WP-CLI, MariaDB portability and WordPress site creation")
    print("[NOT FOR DISTRIBUTION] Built without a complete portable runtime")


if __name__ == "__main__":
    main()
