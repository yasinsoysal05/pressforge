#!/usr/bin/env python3
"""Native Intel macOS smoke test for staged, isolated MariaDB (not a Ventura test)."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

RUNTIME = Path(__file__).resolve().parents[1] / "src-tauri/resources/runtime"


def run(args: list[str], env: dict[str, str], timeout: int = 90) -> str:
    p = subprocess.run(args, env=env, text=True, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f"exit={p.returncode}: {' '.join(args[:2])}\n{p.stderr[-2500:]}\n{p.stdout[-1200:]}")
    return p.stdout.strip()


def main() -> None:
    if sys.platform != "darwin" or os.uname().machine != "x86_64":
        raise SystemExit("Must run on Intel macOS")
    basedir = RUNTIME / "mariadb"
    server = basedir / "bin/mariadbd"
    client = basedir / "bin/mariadb"
    installer = basedir / "scripts/mariadb-install-db"
    if not installer.is_file():
        installer = basedir / "bin/mariadb-install-db"
    for path in (server, client, installer):
        if not path.is_file():
            raise SystemExit(f"Missing MariaDB runtime component: {path}")
    env = dict(os.environ)
    env["PATH"] = f"{basedir / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin:{env.get('PATH','')}"
    # /tmp ensures the Unix socket path fits the short macOS sun_path field.
    with tempfile.TemporaryDirectory(prefix="pfdb-", dir="/tmp") as folder:
        work = Path(folder)
        datadir = work / "data"
        datadir.mkdir(mode=0o700)
        socket = work / "s.sock"
        error_log = work / "mariadb.log"
        try:
            print("Initializing isolated MariaDB data directory", flush=True)
            print(run([str(installer), "--no-defaults", f"--basedir={basedir}",
                f"--datadir={datadir}", "--auth-root-authentication-method=normal",
                "--skip-test-db"], env, timeout=120)[-800:], flush=True)
            print("Starting bundled MariaDB with --skip-networking", flush=True)
            proc = subprocess.Popen([str(server), "--no-defaults",
                f"--basedir={basedir}", f"--datadir={datadir}",
                f"--socket={socket}", f"--pid-file={work / 'mariadb.pid'}",
                f"--log-error={error_log}", "--skip-networking"],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, env=env)
            try:
                error = None
                for _ in range(100):
                    status = proc.poll()
                    if status is not None:
                        raise RuntimeError(f"MariaDB exited during startup with code {status}")
                    try:
                        output = run([str(client), "--no-defaults",
                            f"--socket={socket}", "--protocol=SOCKET",
                            "--user=root", "--execute=SELECT 1"], env, timeout=3)
                        if "1" in output:
                            print("[OK] Isolated MariaDB socket SQL query succeeded", flush=True)
                            error = None
                            break
                    except Exception as exc:
                        error = exc
                    time.sleep(0.2)
                else:
                    raise RuntimeError(f"MariaDB startup timeout: {error}")
                print("[OK] No TCP listener required", flush=True)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)
        except Exception:
            if error_log.exists():
                print("MariaDB log tail:\n" + error_log.read_text(errors="replace")[-3500:], file=sys.stderr)
            raise
    print("[OK] Packaged MariaDB initialization, SQL, and shutdown verified on runner")
    print("[NOT VERIFIED] Intel macOS Ventura 13.7.8 actual device test")


if __name__ == "__main__":
    main()
