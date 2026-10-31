# PressForge — Modular WordPress Studio (Draft PR #10)

PressForge is a local-first modular WordPress desktop application built with Tauri 2, React, TypeScript and Rust. This implementation builds on the Ventura runtime staging and source compilation work in draft PR #7 and PR #9.

## Working modules and their boundaries

| Module | Description |
| --- | --- |
| PHP Engine | Inspect bundled PHP and mysqli driver; development-mode host fallback only |
| MariaDB | Bundled database server/client or existing development environment |
| WP-CLI | Bundled hash-verified PHAR or developer-installed WP-CLI |
| PHP Development Server | Loopback-only HTTP server for each WordPress site |
| Plugins / Themes | List, activate and deactivate with an allowlisted WP-CLI command and validated slug |
| Snapshots | Owner-private site file copy + mandatory SQL dump; stop-site-only restore with preflight, fresh recovery SQL and best-effort rollback |
| PHP Logs | Per-site local error log viewer |
| Database Inspector | Read-only WordPress table listing and column schema; never accepts arbitrary SQL; validates selected table against live registered WordPress database tables |

Module Center reports ready, missing, disabled and planned. Optional extensions and snapshot modules can be switched on/off; the backend enforces those settings and persists them into Application Support/modules.json. Core PHP/MariaDB/WP-CLI engines cannot be disabled independently while other modules need them.

## Database Inspector security model

- Uses the site's WP-CLI database connection with `wp db tables --format=list --all-tables-with-prefix` and `wp db columns ... --format=json`.
- Selected table names must be returned from the same site's live table listing; no user-supplied SQL, shell interpolation, ALTER/DROP/UPDATE or remote connection.
- Validates table identifiers and caps returned table and schema sizes.
- Includes read-only WordPress integration checks in CI and Rust unit tests.
- This tool is a database **schema inspector**, not a phpMyAdmin replacement or a full SQL query console.

## Snapshot safety

Each snapshot contains a files directory, database.sql and snapshot.json. The WordPress site must be stopped first. Any SQL export failure aborts the operation, and the partial snapshot is deleted. Symlinks and special files are rejected. SQL dumps can contain private data. The UI can open the local snapshot directory in Finder.

**Snapshot restore is implemented in the draft branch, but not yet accepted on real Ventura.** The user must stop the site and explicitly type `GERI YUKLE` to confirm replacing its files and SQL. The backend verifies the snapshot belongs to the same site, rejects symlinks/invalid IDs, stages replacement files, exports a fresh database recovery SQL, and keeps the original public directory until the restored database and local site URL are checked. If restoration fails, it attempts to restore both files and SQL. If rollback itself fails, recovery files remain in the site's data directory and a critical error is shown rather than destroying them. Because file-system and MariaDB updates cannot form a single ACID transaction, a crash or power loss can still require manual recovery. Test on a disposable site before using real project data.

## Planned (not functional in the current build)

- Local HTTPS and trusted developer certificates, .test domains
- Switchable multiple PHP versions, Apache/Nginx adapters
- Full site clone, import/export, snapshot verification hashes and disaster-recovery automation
- Git/GitHub branch, commit and diff tools
- SSH deployment to aaPanel, cPanel, Plesk, with staging and rollback
- Opt-in live synchronization with pre-publish backup and approval
- AI error/performance checks and WordPress/Elementor compatibility analysis

The UI displays these as planned rather than pretending they work.

## Packaging requirements

The previous PressForge 0.2.0 Intel DMG was a non-standalone preview: PHP/MariaDB/WP-CLI binaries were not included. This branch alone does not fix that. A real independent Ventura DMG requires compiling PHP and MariaDB for Intel macOS Ventura 13, checking their transitive dependencies, staging pinned WP-CLI and successfully exercising WordPress on a clean Ventura system.

On a real Intel Ventura 13 host, developers can use:

    bash scripts/ventura-pipeline.sh --doctor
    bash scripts/ventura-pipeline.sh --build --jobs 2

These gates must pass before signed/notarized public release. A macos-15-intel native CI compile is not equivalent to a standalone Ventura runtime acceptance test.

Source PRs: https://github.com/yasinsoysal05/pressforge/pull/7, https://github.com/yasinsoysal05/pressforge/pull/9, https://github.com/yasinsoysal05/pressforge/pull/10
