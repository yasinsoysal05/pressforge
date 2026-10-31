#!/usr/bin/env python3
"""Fail-closed audit of staged Mach-O dependencies for Intel macOS Ventura 13.

Checks linkage names inside the staged bundle. This does NOT prove that Apple
framework symbols present on macOS 15 are available on macOS 13.
"""
from __future__ import annotations

from pathlib import Path
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1] / "src-tauri/resources/runtime"
MIN_TARGET = (13, 0, 0)


def run(*args: str) -> str:
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        raise ValueError(f"{args[0]} {args[1:]} failed: {p.stderr[-500:]}")
    return p.stdout


def parse_version(raw: str) -> tuple[int, int, int]:
    items = [int(x) for x in raw.split(".")]
    return tuple((items + [0, 0, 0])[:3])


def is_macho(file: Path) -> bool:
    if file.is_symlink() or not file.is_file():
        return False
    return "Mach-O" in run("file", "-b", str(file))


def versions(file: Path) -> list[tuple[int, int, int]]:
    text = run("otool", "-arch", "x86_64", "-l", str(file)).splitlines()
    result = []
    for i, line in enumerate(text):
        if line.strip() == "cmd LC_BUILD_VERSION":
            for part in text[i:i+8]:
                m = re.search(r"\bminos\s+(\d+(?:\.\d+){1,2})", part)
                if m:
                    result.append(parse_version(m.group(1)))
                    break
        if line.strip() == "cmd LC_VERSION_MIN_MACOSX":
            for part in text[i:i+8]:
                m = re.search(r"\bversion\s+(\d+(?:\.\d+){1,2})", part)
                if m:
                    result.append(parse_version(m.group(1)))
                    break
    return result


def check() -> None:
    if sys.platform != "darwin" or os.uname().machine != "x86_64":
        raise SystemExit("Run on an Intel macOS runner")
    if not ROOT.is_dir():
        raise SystemExit(f"Missing runtime: {ROOT}")
    errors = []
    for item in ROOT.rglob("*"):
        if not item.is_symlink():
            continue
        resolved = item.resolve()
        if not resolved.is_relative_to(ROOT.resolve()) or not resolved.exists():
            errors.append(f"External or dangling symlink: {item} -> {resolved}")
    count = 0
    for item in ROOT.rglob("*"):
        if not is_macho(item):
            continue
        count += 1
        ftype = run("file", "-b", str(item))
        # "universal" in file(1) is not evidence of an x86_64 slice.
        slice_check = subprocess.run(
            ["lipo", "-verify_arch", "x86_64", str(item)],
            capture_output=True, check=False,
        )
        if slice_check.returncode != 0:
            errors.append(f"Missing Intel x86_64 slice: {item}: {ftype}")
            continue
        minimum = versions(item)
        if not minimum:
            errors.append(f"No macOS minimum load command: {item}")
        elif max(minimum) > MIN_TARGET:
            errors.append(f"Requires macOS >13: {item} ({minimum})")
        dylib_id = run("otool", "-arch", "x86_64", "-D", str(item)).splitlines()
        self_id = dylib_id[1].strip() if len(dylib_id)>1 else ""
        deps = run("otool", "-arch", "x86_64", "-L", str(item)).splitlines()[1:]
        for entry in deps:
            dep = entry.strip().split(" (", 1)[0]
            if not dep or dep == self_id:
                continue
            if dep.startswith(("/usr/lib/", "/System/Library/")):
                continue
            if dep.startswith("@loader_path/"):
                target = (item.parent / dep.removeprefix("@loader_path/")).resolve()
                if not target.is_file() or not target.is_relative_to(ROOT.resolve()):
                    errors.append(f"Unresolved/outside @loader_path: {item} -> {dep}")
            else:
                errors.append(f"Non-relocatable Mach-O linkage: {item} -> {dep}")
    if count == 0:
        errors.append("No Mach-O binaries found in staged runtime")
    print(f"Audited {count} bundled Mach-O files")
    if errors:
        for item in errors[:40]:
            print("[FAIL] " + item, file=sys.stderr)
        if len(errors) > 40:
            print(f"... and {len(errors)-40} more errors", file=sys.stderr)
        raise SystemExit(1)
    print("[OK] Bundled Mach-O architecture, minOS, dylib linkage and symlinks")
    print("[NOT TESTED] Target Ventura 13 runtime and Apple framework symbols")


if __name__ == "__main__":
    check()
