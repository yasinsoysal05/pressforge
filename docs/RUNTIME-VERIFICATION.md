# Bundled Runtime Verification

**Scope:** PressForge standalone DMG engine validation on Intel macOS.

The default user story is **no system PHP, MariaDB, WP-CLI, Node, Rust or Homebrew required** after installing PressForge.app. The engine in `Contents/Resources/runtime` must be self-contained and writes its database files to Application Support, never back into the signed app bundle.

## Validation pipeline

The [experimental runtime workflow](../.github/workflows/validate-portable-runtime.yml) runs on `macos-15-intel` and performs:

1. Install build-time PHP and MariaDB in the runner (not on the end-user's Mac).
2. Stage the package and relocate Mach-O dependencies.
3. Verify PHP drivers, WP-CLI and MariaDB binaries execute.
4. Audit all staged Mach-O executable minimum macOS versions (13.0 or less), internal dylib resolution, and symlink targets.
5. Initialize a new MariaDB datadir in a disposable directory, start the bundled daemon with `--skip-networking`, connect over a private Unix socket and stop the process.

**Passing the workflow does not certify macOS 13 compatibility**: native symbol availability and Apple framework behavior must still be tested on a genuine Ventura device. macOS 15's Homebrew-provided PHP and MariaDB binaries may require API symbols unavailable on Ventura. Do not claim standalone DMG readiness without clean Ventura acceptance tests.

## Packaging controls

- Fail the packaging job on missing executable, invalid architecture, minOS > 13, non-relocated library or escaped symlink.
- Verify WordPress CLI can execute with bundled PHP without relying on global `php.ini`.
- Smoke-test the MariaDB startup and connection via Unix socket, without TCP.
- Keep all secrets outside CLI arguments and logs; avoid high-privilege daemon accounts.
- Test a fresh WordPress installation, login, stop/restart and archive on target hardware before closing Issue #2.
- Audit PHP/MariaDB/WordPress/WP-CLI licenses before distributing binaries.

## Current status

- Source code and tests are **experimental**.
- No signed or notarized standalone Ventura DMG has passed the above gate.
- Native `.app` compilation on GitHub's Intel macOS runner does **not** include bundled PHP/MariaDB unless staging is successful.

## WP-CLI supply-chain lock

`runtime-lock.json` now records the expected SHA-512 of the official WP-CLI PHAR. Builds verify the downloaded bytes against that **versioned local digest** rather than trusting a mutable checksum served from the same remote location. When upstream replaces `wp-cli.phar`, the build fails until a reviewed lockfile update is merged. This is an integrity and reproducibility guard, not a substitute for independent provenance verification and signature checks.
