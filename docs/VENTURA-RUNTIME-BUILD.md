# Reproducible Intel macOS Ventura runtime preparation

## Confirmed hosted runner limitation

As of 2026-10-31, the macos-15-intel Homebrew PHP 8.3 and MariaDB 11.4 packages have a macOS **14.0 minimum runtime**. The automated audit found 105 incompatible Mach-O files, including `php` and `mariadbd`: [CI log](https://github.com/yasinsoysal05/pressforge/actions/runs/41214798492). Do not hack their load commands to 13.0; doing so cannot add APIs that aren't present in Ventura.

## Required build host

Use a dedicated **Intel x86_64 macOS Ventura 13.7.8** host (the target machine may be used for development) with Xcode Command Line Tools, Python 3, a suitable Rust toolchain, and Node 22. Runtime binaries **must be built for macOS 13** together with *all* non-system shared libraries.

You may build PHP and MariaDB from checked/pinned upstream source releases in dedicated, non-system prefixes. PressForge does **not yet automate their entire source compilation**. Build scripts, tarball signatures/checksums, library redistribution and the macOS deployment target need separate review; these are critical release blockers (see [Issue #8](https://github.com/yasinsoysal05/pressforge/issues/8)).

Expected runtime prefix structures:

```text
<php-prefix>/bin/php
<php-prefix>/etc/
<mariadb-prefix>/bin/mariadbd
<mariadb-prefix>/bin/mariadb
<mariadb-prefix>/bin/mariadb-install-db (or scripts/mariadb-install-db)
```

## Stage from **verified Ventura-compatible** build prefixes

```bash
cd pressforge
export PRESSFORGE_PHP_PREFIX="/path/to/ventura-built/php-prefix"
export PRESSFORGE_MARIADB_PREFIX="/path/to/ventura-built/mariadb-prefix"
bash scripts/verify-runtime-on-ventura.sh
```

This script stops on the first failing gate and does not alter existing system PHP/MySQL services. It stages copies into `src-tauri/resources/runtime/`, which is excluded from Git.

When it passes, on the *same build host*:

```bash
npm ci
bash scripts/build-intel-dmg.sh
```

**Do not release a DMG yet:** the installer and installed app still need an end-to-end WordPress install, site startup, PHP/MySQL/process lifecycle tests on a **clean Ventura machine without the builder's Homebrew or MacPorts dependencies**. Finally verify code signing/notarization and GPL/other third-party notices and distribution requirements.

## Security notes

- Never run untrusted public PR code on a self-hosted macOS machine that contains credentials or personal files.
- Do not attach a permanent self-hosted runner to unrestricted PR workflows in a public repository.
- Build only reviewed source in a dedicated environment.
- Avoid storing DB passwords in command-line arguments, build logs or version-controlled manifests.
- All dynamically linked non-system libraries must be copied and audited. Missing deps must fail the build rather than silently falling back to `/usr/local` or `/opt/local`.
