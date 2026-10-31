# Native Intel macOS CI (experimental)

This repository has two independent CI gates:

1. **Ubuntu source checks** validate version consistency, project structure, the PHP router, TypeScript and Vite.
2. **macos-15-intel native compile** builds Tauri/Rust for `x86_64-apple-darwin`, creates a non-distributable `.app`, checks the resulting executable is Intel Mach-O, and checks the executable's minimum OS load command does not exceed macOS 13.0. It also runs the Rust unit tests.

## Limits — do not confuse a green check with a working application

- The GitHub runner uses **macOS 15**, not Ventura 13.
- The compiled `.app` **does not include a verified PHP/MariaDB runtime**. It is only used as build evidence and is **not published** as an installable release.
- Minimum version metadata on the main executable does **not** prove that WebKit, frameworks, dynamically loaded libraries, MariaDB or PHP run on Ventura.
- The separate experimental DMG workflow is still gated by staging and verifying a portable runtime.
- WP-CLI WordPress installation, startup, admin login, process cleanup, backup, signing and notarization require real device tests.

## Target hardware acceptance checklist

On **Intel macOS Ventura 13.7.8**, run:

- [ ] Launch the built app.
- [ ] Confirm all bundled Mach-O files target <= macOS 13.0 and all dylib references resolve.
- [ ] Confirm isolated MariaDB initialisation and shutdown.
- [ ] Confirm PHP and WordPress dependencies load without Homebrew.
- [ ] Create one site; visit `127.0.0.1` local URL and WP Admin.
- [ ] Verify stop/start, logs and archive behavior.
- [ ] Verify installation with no Rust, Node, Homebrew, PHP or MariaDB on a clean test machine.
- [ ] Document signing and notarization state before distribution.

Do not mark Issue #2 complete until the target-hardware checks pass.
