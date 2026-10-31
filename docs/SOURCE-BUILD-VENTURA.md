# PressForge — Intel macOS Ventura 13 Source Build

**Status: experimental build recipe. Not a validated standalone DMG.**

## Why we need this

The hosted macos-15-intel Homebrew PHP and MariaDB executables require macOS 14.0. The runtime audit identified 105 incompatible Mach-O objects, including php and mariadbd. Evidence: https://github.com/yasinsoysal05/pressforge/actions/runs/41214798492

## Source integrity

source-runtime-lock.json pins official upstream release source archives using SHA-256. PHP 8.3.35 is a security release (https://www.php.net/downloads.php). MariaDB 11.4.13 source files are listed at https://dlm.mariadb.com/browse/mariadb_server/11.4.13/source/ . Further release-signature verification is recommended before binary distribution.

## Offline safety check

```bash
python3 scripts/build-runtime-from-source.py --verify-lock
```

This checks the pinned manifest; it does not download, compile, or modify system services.

## One-command development pipeline

PR #9 now builds on top of PR #7 (standalone runtime staging). On a **real Intel macOS Ventura 13.x** development machine, the new end-to-end developer entrypoint is:

```bash
git clone https://github.com/yasinsoysal05/pressforge.git
cd pressforge
git switch feat/ventura-source-build

# Read-only prerequisite diagnostics, without installing or changing services:
bash scripts/ventura-pipeline.sh --doctor

# After prerequisites are present, source build + runtime audit + WordPress
# disposable installation test + unsigned developer DMG:
bash scripts/ventura-pipeline.sh --build --jobs 2
```

This pipeline deliberately fails if preflight requirements, source download SHA-256, native dependencies, MariaDB startup, WordPress installation, or Tauri build fail. It does not invoke `sudo`, modify host database services, publish a GitHub Release, or upload files. Source build output and staged binary dependencies remain in gitignored directories.

**Do not treat any DMG as distributable until a clean Intel Ventura machine test, code signing, notarization and third-party license obligations are verified.** Currently neither the real-device build nor these acceptance tests have passed.

## Compile on a real Intel macOS Ventura 13.x build host

Start with this **read-only** prerequisite check (does not install or alter services):

```bash
bash scripts/doctor-ventura-build-host.sh
```


Prerequisites: Xcode Command Line Tools, Python 3.9+, cmake, pkg-config, GNU bison 3+, clang/clang++, make. Build dependencies must also target Intel Ventura: openssl, libxml-2.0, libcurl, libzip, oniguruma, icu-uc, icu-i18n. Configure PKG_CONFIG_PATH to point to approved x86_64 dependency prefixes. The end user will NOT need these build tools once a valid DMG exists.

```bash
python3 scripts/build-runtime-from-source.py --download-only
python3 scripts/build-runtime-from-source.py --build --jobs 2
```

Build products stay under .pressforge-build/ventura/dist/php and .pressforge-build/ventura/dist/mariadb, which are gitignored. The build sets MACOSX_DEPLOYMENT_TARGET=13.0 and uses Intel x86_64 compilation flags. It never uses sudo or starts system databases.

Both CMake and PHP configuration can fail on older machines due to the SDK, library or tool version. Treat this as a diagnostic prototype, not a promise of a buildable app. If a library requires macOS 14+, rebuild it for Ventura, never edit minimum OS metadata to hide the problem.

## Stage and test in PressForge

The packaging/validation gate is in draft PR #7 and may not exist on main until that PR is merged: https://github.com/yasinsoysal05/pressforge/pull/7

```bash
export PRESSFORGE_PHP_PREFIX="$PWD/.pressforge-build/ventura/dist/php"
export PRESSFORGE_MARIADB_PREFIX="$PWD/.pressforge-build/ventura/dist/mariadb"
bash scripts/verify-runtime-on-ventura.sh
bash scripts/build-intel-dmg.sh
```

After that we must verify ALL bundled Mach-O dylibs and libraries, MariaDB initialisation, socket SQL, new WordPress site installation, WP Admin, start/stop and a clean-install test on actual Ventura. Code signing, notarization and third-party license obligations are separate release gates.

## Public repository security

Never connect a personal Mac with documents, secrets or SSH keys as an unrestricted self-hosted runner for public pull requests. Execute only approved builds with a dedicated isolated account and manually reviewed code.

Tracking: https://github.com/yasinsoysal05/pressforge/issues/8

## Strict Ventura-only DMG gate

Even a development DMG is now rejected unless `sw_vers` reports **Intel macOS 13.x**. The DMG builder runs `smoke-wordpress-macos.py` itself (not only in the higher-level pipeline), so bypassing the orchestrator cannot accidentally skip the disposable real WordPress install, home-page and login HTTP checks. The separate native CI compilation on macOS 15 produces only a non-distributable `.app` without bundled PHP/MariaDB.

## Final Tauri app bundle gate

`scripts/build-intel-dmg.sh` now checks the generated `PressForge.app` **after Tauri packaging**. The gate rejects the build if:

- The bundle identifier is not `dev.pressforge.desktop`, or the expected app directory does not contain exactly one `.app`.
- `Contents/Resources/runtime` does not include executable PHP, MariaDB client/server and the MariaDB database installer.
- The WP-CLI PHAR bytes differ from the committed SHA-512 value in `runtime-lock.json`.
- Any bundled symlink escapes the app's runtime resource directory.
- A Mach-O dependency lacks the Intel x86_64 slice, requires macOS newer than 13, or points to an unbundled dylib.

The bundled-resource check is in `scripts/verify-app-bundle-macos.py`. It **does not** replace the real Ventura 13 device test, the Tauri UI test, a clean-machine test, Apple signing/notarization or complete third-party license review. A passing developer build is not a public release.
