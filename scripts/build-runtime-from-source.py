#!/usr/bin/env python3
"""Build pinned PHP and MariaDB source releases on a real Intel macOS Ventura 13 host.

No sudo, no brew service manipulation, no user database changes. Outputs build
prefixes to a private working directory. Not a guarantee of portable binaries:
stage-runtime-macos.py and Ventura acceptance tests are mandatory afterward.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.error
import urllib.request

REPO = Path(__file__).resolve().parents[1]
LOCK = REPO / "source-runtime-lock.json"
DEFAULT_BUILD = REPO / ".pressforge-build" / "ventura"


def fail(msg: str) -> None:
    raise SystemExit("[FAIL] " + msg)


def run(args: list[str], **kw) -> str:
    print("[RUN] " + " ".join(map(str, args)), flush=True)
    result = subprocess.run(args, check=False, text=True, **kw)
    if result.returncode:
        fail(f"Command exited {result.returncode}: {args[0]}")
    return ""


def lockfile() -> dict:
    obj = json.loads(LOCK.read_text("utf-8"))
    if obj.get("schema") != 1 or obj.get("platform") != {
        "os": "macOS", "major": 13, "arch": "x86_64", "deployment_target": "13.0"
    }:
        fail("Invalid source runtime lock target or schema")
    for key in ("php", "mariadb"):
        item = obj[key]
        if not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
            fail(f"Invalid {key} SHA-256")
        if not item["url"].startswith("https://"):
            fail(f"Non-HTTPS source: {key}")
        if "/" in item["filename"] or "\\" in item["filename"]:
            fail(f"Invalid archive filename: {key}")
        if not item["url"].endswith("/" + item["filename"]):
            fail(f"Archive URL/filename mismatch: {key}")
        for alternate in item.get("fallback_urls", []):
            if not alternate.startswith("https://") or not alternate.endswith("/" + item["filename"]):
                fail(f"Untrusted fallback archive URL format: {key}")
    return obj


def preflight() -> dict[str, str]:
    import platform
    if sys.platform != "darwin" or platform.machine() != "x86_64":
        fail("Source runtime must be built on Intel macOS")
    version = subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
    if not version.startswith("13."):
        fail(f"Real Ventura macOS 13.x build host required; got {version}")
    for cmd in ("clang", "clang++", "make", "cmake", "pkg-config", "bison", "xcrun"):
        if not shutil.which(cmd):
            fail(f"Missing build tool: {cmd}. Install it in the build environment first.")
    bison_version = subprocess.check_output(["bison", "--version"], text=True).splitlines()[0]
    ver = re.search(r"(\d+)\.(\d+)", bison_version)
    if not ver or int(ver.group(1)) < 3:
        fail(f"GNU Bison 3+ required (macOS system bison may be too old): {bison_version}")
    for dep in ("openssl", "libxml-2.0", "libcurl", "libzip", "oniguruma", "icu-uc", "icu-i18n"):
        if subprocess.run(["pkg-config", "--exists", dep]).returncode:
            fail(f"Missing pkg-config dependency {dep}; build it for Ventura x86_64 and set PKG_CONFIG_PATH")
    sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
    env = dict(os.environ)
    env["SDKROOT"] = sdk
    env["MACOSX_DEPLOYMENT_TARGET"] = "13.0"
    for key in ("CFLAGS", "CXXFLAGS", "LDFLAGS"):
        env[key] = f"-arch x86_64 -mmacosx-version-min=13.0 " + env.get(key, "")
    env["CC"] = "clang"
    env["CXX"] = "clang++"
    print(f"[HOST] Intel macOS {version}, SDK={sdk}", flush=True)
    return env


def download(source: dict, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    output = dest / source["filename"]
    sha = source["sha256"]
    def valid(file: Path) -> bool:
        if not file.is_file():
            return False
        hasher = hashlib.sha256()
        with file.open("rb") as inp:
            for block in iter(lambda: inp.read(1024 * 1024), b""):
                hasher.update(block)
        return hasher.hexdigest() == sha
    if not valid(output):
        # Download to a temporary file, never treat a partial artifact as complete.
        # The fallback is only for network availability; every mirror must match
        # the same hard-coded SHA-256 from the reviewed lockfile.
        temp = output.with_name(output.name + ".partial")
        failures = []
        for url in [source["url"]] + source.get("fallback_urls", []):
            temp.unlink(missing_ok=True)
            req = urllib.request.Request(url, headers={"User-Agent": "PressForge-source-builder/0.3"})
            print(f"[FETCH] {url}", flush=True)
            try:
                with urllib.request.urlopen(req, timeout=120) as response, temp.open("wb") as out:
                    shutil.copyfileobj(response, out)
                if not valid(temp):
                    fail(f"Source SHA256 mismatch for {source['filename']} from {url}")
                temp.rename(output)
                break
            except (OSError, urllib.error.URLError) as exc:
                failures.append(f"{url}: {exc}")
                print(f"[NETWORK] Mirror unavailable: {exc}", flush=True)
            finally:
                temp.unlink(missing_ok=True)
        if not valid(output):
            fail("No verified source archive could be downloaded:\\n" + "\\n".join(failures))
    print(f"[OK] Verified SHA256 {sha}: {output}", flush=True)
    return output


def unpack(file: Path, target: Path) -> Path:
    target.mkdir(parents=True, exist_ok=True)
    marker = target / ".pressforge-extracted"
    if marker.exists():
        roots = [p for p in target.iterdir() if p.is_dir()]
        if len(roots) == 1:
            return roots[0]
    # Source tarball is checksum verified. Still reject path traversal and
    # absolute entries before extracting with macOS-compatible Python.
    with tarfile.open(file, "r:*") as archive:
        members = archive.getmembers()
        for member in members:
            parts = Path(member.name).parts
            if member.name.startswith("/") or ".." in parts or member.isdev():
                fail(f"Unsafe tar member: {member.name}")
        archive.extractall(target)
    marker.touch()
    roots = [p for p in target.iterdir() if p.is_dir()]
    if len(roots) != 1:
        fail(f"Unexpected source archive layout: {file.name}")
    return roots[0]


def build_php(src: Path, prefix: Path, env: dict, jobs: int) -> None:
    config = [
        str(src / "configure"), f"--prefix={prefix}", "--enable-cli",
        "--disable-cgi", "--disable-phpdbg", "--disable-fpm",
        "--with-mysqli=mysqlnd", "--with-pdo-mysql=mysqlnd",
        "--with-openssl", "--with-curl", "--with-zlib",
        "--with-zip", "--enable-mbstring", "--enable-opcache",
        "--enable-intl", "--enable-exif"
    ]
    run(config, cwd=src, env=env)
    run(["make", f"-j{jobs}"], cwd=src, env=env)
    run(["make", "install"], cwd=src, env=env)
    php = prefix / "bin/php"
    if not php.exists():
        fail(f"PHP binary missing after build: {php}")
    run([str(php), "-n", "-m"], env=env)


def build_mariadb(src: Path, prefix: Path, builddir: Path, env: dict, jobs: int) -> None:
    cmake = [
        "cmake", "-S", str(src), "-B", str(builddir),
        f"-DCMAKE_INSTALL_PREFIX={prefix}",
        "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0",
        "-DCMAKE_OSX_ARCHITECTURES=x86_64",
        "-DINSTALL_LAYOUT=STANDALONE", "-DWITH_SSL=system",
        "-DWITH_UNIT_TESTS=OFF", "-DPLUGIN_ROCKSDB=NO"
    ]
    run(cmake, env=env)
    run(["cmake", "--build", str(builddir), "--parallel", str(jobs)], env=env)
    run(["cmake", "--install", str(builddir)], env=env)
    for required in ("bin/mariadbd", "bin/mariadb"):
        if not (prefix / required).is_file():
            fail(f"MariaDB missing after install: {prefix / required}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-lock", action="store_true", help="Offline schema/checksum format validation only")
    parser.add_argument("--download-only", action="store_true", help="Download and validate source archives; do not compile")
    parser.add_argument("--build", action="store_true", help="Compile on real Intel macOS Ventura 13")
    parser.add_argument("--jobs", type=int, default=2, help="Parallel builds; 2 is conservative for older Intel Macs")
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD)
    args = parser.parse_args()
    if args.jobs < 1 or args.jobs > 16:
        fail("jobs must be between 1 and 16")
    lock = lockfile()
    print(f"[OK] Source lock: PHP {lock['php']['version']} / MariaDB {lock['mariadb']['version']}")
    if args.verify_lock:
        return
    if not (args.build or args.download_only):
        parser.error("Specify --verify-lock, --download-only or --build")
    env = preflight() if args.build else None
    root = args.build_dir.expanduser().resolve()
    archives = {key: download(lock[key], root / "downloads") for key in ("php", "mariadb")}
    if args.download_only:
        return
    sources = {key: unpack(archives[key], root / "sources" / key) for key in ("php", "mariadb")}
    php_prefix = root / "dist/php"
    mariadb_prefix = root / "dist/mariadb"
    build_php(sources["php"], php_prefix, env, args.jobs)
    build_mariadb(sources["mariadb"], mariadb_prefix, root / "obj/mariadb", env, args.jobs)
    print("\n[BUILT] Source compilation completed; portability still NOT proven.")
    print(f"export PRESSFORGE_PHP_PREFIX='{php_prefix}'")
    print(f"export PRESSFORGE_MARIADB_PREFIX='{mariadb_prefix}'")
    print("bash scripts/verify-runtime-on-ventura.sh  # from PR #7")
    print("Do not publish a DMG before real Ventura application/WordPress tests.")


if __name__ == "__main__":
    main()
