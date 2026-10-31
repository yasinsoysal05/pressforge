#!/usr/bin/env python3
"""End-to-end WordPress acceptance probe for an already staged Intel macOS runtime.

Uses a disposable MariaDB instance and a disposable WordPress installation.
Does not alter system databases, service configuration or existing WP projects.
Requires network access to download official WordPress via bundled WP-CLI.
"""
from __future__ import annotations

import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

BASE = Path(__file__).resolve().parents[1]
RUNTIME = BASE / "src-tauri/resources/runtime"
ROUTER = BASE / "src-tauri/src/router.php"


def exec_checked(argv: list[str], env: dict[str, str], *, input_text: str | None = None,
                 cwd: Path | None = None, timeout: int = 120) -> str:
    # Never print argv: some upstream tools may expose credentials in options.
    p = subprocess.run(argv, input=input_text, text=True, capture_output=True,
                       cwd=cwd, env=env, timeout=timeout)
    if p.returncode:
        # Redact potentially sensitive stdout/stderr: only print tool and exit code.
        raise RuntimeError(f"{Path(argv[0]).name} failed with exit {p.returncode}; "
                           "inspect the disposable test logs on your own machine")
    return p.stdout


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def stop_child(child: subprocess.Popen | None) -> None:
    if child is None or child.poll() is not None:
        return
    child.terminate()
    try:
        child.wait(timeout=6)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=3)


def main() -> None:
    if sys.platform != "darwin" or os.uname().machine != "x86_64":
        raise SystemExit("[FAIL] This test requires an Intel macOS machine")
    version = subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
    if not version.startswith("13."):
        raise SystemExit(f"[FAIL] Real Ventura 13.x target required, found {version}")
    php = RUNTIME / "php/bin/php"
    wp = RUNTIME / "tools/wp-cli.phar"
    db = RUNTIME / "mariadb/bin/mariadbd"
    client = RUNTIME / "mariadb/bin/mariadb"
    install_db = RUNTIME / "mariadb/scripts/mariadb-install-db"
    if not install_db.is_file():
        install_db = RUNTIME / "mariadb/bin/mariadb-install-db"
    for p in (php, wp, db, client, install_db, ROUTER):
        if not p.is_file():
            raise SystemExit(f"[FAIL] Missing staged runtime file: {p}")
    env = dict(os.environ)
    env.update({
        "PATH": f"{RUNTIME/'mariadb/bin'}:{RUNTIME/'php/bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
        "PHPRC": str(RUNTIME / "php/etc"),
        "PHP_INI_SCAN_DIR": "",
    })
    exec_checked([str(php), "-n", str(wp), "--version"], env)

    # Keep Unix-domain socket paths well under Darwin sun_path limits.
    with tempfile.TemporaryDirectory(prefix="pf-wp-", dir="/tmp") as workstr:
        work = Path(workstr)
        datadir = work / "db"
        datadir.mkdir(mode=0o700)
        public = work / "wordpress"
        public.mkdir(mode=0o700)
        socket_path = work / "s.sock"
        log = work / "mariadb.log"
        php_log = work / "php.log"
        credentials = secrets.token_hex(20)
        admin_password = secrets.token_urlsafe(24)
        port = free_port()
        database_process: subprocess.Popen | None = None
        php_process: subprocess.Popen | None = None
        try:
            print("[1/6] Initialize private MariaDB datadir", flush=True)
            exec_checked([str(install_db), "--no-defaults",
                         f"--basedir={RUNTIME/'mariadb'}",
                         f"--datadir={datadir}",
                         "--auth-root-authentication-method=normal",
                         "--skip-test-db"], env, timeout=180)
            database_process = subprocess.Popen(
                [str(db), "--no-defaults", f"--basedir={RUNTIME/'mariadb'}",
                 f"--datadir={datadir}", f"--socket={socket_path}",
                 f"--pid-file={work/'mariadb.pid'}", f"--log-error={log}",
                 "--skip-networking"],
                env=env, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            root_sql = [str(client), "--no-defaults", f"--socket={socket_path}",
                        "--protocol=SOCKET", "--user=root", "--batch"]
            print("[2/6] Wait for SQL socket", flush=True)
            for _ in range(100):
                if database_process.poll() is not None:
                    raise RuntimeError("Isolated MariaDB exited during startup")
                try:
                    exec_checked(root_sql + ["--execute=SELECT 1"], env, timeout=3)
                    break
                except (RuntimeError, subprocess.TimeoutExpired):
                    time.sleep(0.2)
            else:
                raise RuntimeError("Isolated MariaDB did not become ready")
            # Trusted identifiers and generated hexadecimal password: no shell.
            query = (
                "CREATE DATABASE pf_wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
                f"CREATE USER 'pf_wordpress'@'localhost' IDENTIFIED BY '{credentials}';\n"
                "GRANT ALL PRIVILEGES ON pf_wordpress.* TO 'pf_wordpress'@'localhost';\n"
            )
            exec_checked(root_sql, env, input_text=query)
            print("[3/6] Download WordPress via bundled PHP and WP-CLI", flush=True)
            prefix = [str(php), "-n", str(wp)]
            exec_checked(prefix + ["core", "download", f"--path={public}",
                                   "--locale=en_US"], env, timeout=240)
            print("[4/6] Configure private socket and install WordPress", flush=True)
            exec_checked(prefix + ["config", "create", f"--path={public}",
                                   "--dbname=pf_wordpress", "--dbuser=pf_wordpress",
                                   f"--dbhost=localhost:{socket_path}",
                                   "--prompt=dbpass", "--skip-check"],
                         env, input_text=credentials + "\n", timeout=50)
            url = f"http://127.0.0.1:{port}"
            exec_checked(prefix + ["core", "install", f"--path={public}",
                                   f"--url={url}", "--title=PressForge Smoke",
                                   "--admin_user=pressforge_test",
                                   "--admin_email=pressforge@example.invalid",
                                   "--skip-email", "--prompt=admin_password"],
                         env, input_text=admin_password + "\n", timeout=90)
            print("[5/6] Launch PHP loopback HTTP site", flush=True)
            with php_log.open("wb") as handle:
                php_process = subprocess.Popen(
                    [str(php), "-n", "-S", f"127.0.0.1:{port}",
                     "-t", str(public), str(ROUTER)],
                    env=env, cwd=public, stdin=subprocess.DEVNULL,
                    stdout=handle, stderr=subprocess.STDOUT)
            for _ in range(60):
                if php_process.poll() is not None:
                    raise RuntimeError("PHP server exited during startup")
                try:
                    with urllib.request.urlopen(url + "/", timeout=2) as reply:
                        page = reply.read(200_000)
                        if reply.status == 200 and b"<html" in page.lower():
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.2)
            else:
                raise RuntimeError("WordPress homepage did not return HTML")
            with urllib.request.urlopen(url + "/wp-login.php", timeout=5) as reply:
                if reply.status != 200:
                    raise RuntimeError("WordPress login screen did not return HTTP 200")
            print("[6/6] WordPress homepage and login HTTP 200 OK", flush=True)
        except Exception:
            # The test is destructive ONLY inside its own TemporaryDirectory.
            # No credential values are printed.
            for name, path in (("MariaDB", log), ("PHP", php_log)):
                if path.is_file():
                    print(f"[{name}] log stored temporarily: {path.name}; "
                          "sensitive content redacted from CI output", file=sys.stderr)
            raise
        finally:
            stop_child(php_process)
            stop_child(database_process)
    print("[OK] Isolated MariaDB + real WordPress installation + local HTTP verified on Ventura")
    print("[NOT VERIFIED] Tauri UI, DMG install, signing/notarization or clean end-user Mac")


if __name__ == "__main__":
    main()
