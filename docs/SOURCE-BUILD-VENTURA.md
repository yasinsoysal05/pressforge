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
