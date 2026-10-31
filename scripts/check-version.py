#!/usr/bin/env python3
"""Fail if declared PressForge application versions diverge (stdlib only)."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
tauri = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
cargo = (ROOT / "src-tauri/Cargo.toml").read_text(encoding="utf-8")
match = re.search(r"(?ms)^\[package\]\s*.*?^version\s*=\s*\"([^\"]+)\"", cargo)
if not match:
    raise SystemExit("Cannot find [package] version in Cargo.toml")
versions = {
    "package.json": package["version"],
    "src-tauri/tauri.conf.json": tauri["version"],
    "src-tauri/Cargo.toml": match.group(1),
}
if len(set(versions.values())) != 1:
    raise SystemExit("Version mismatch: " + str(versions))
print("[OK] version synchronized:", next(iter(versions.values())))
