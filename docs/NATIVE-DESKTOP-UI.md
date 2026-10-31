# PressForge Native macOS Workspace

**Branch:** `feat/modular-local-studio` (draft PR #10).
**Target:** Intel macOS Ventura 13, Tauri 2, React, Rust.
**Status:** New application shell and routes implemented; no claim of a verified portable PHP/MariaDB binary.

## Desktop architecture

The old page-scrolling landing-page layout has been replaced with a fixed-height desktop workspace:

- **Native decorated macOS window.** Real OS titlebar and window buttons, not fabricated traffic-light icons.
- **Persistent left navigation.** Workspace, Engines, WordPress Tools, Network & Integrations are accordion groups. Every module has an independently addressable application view.
- **Document viewport never scrolls.** `html`, `body`, `#root`, window shell, and workarea disable document scrolling. Data tables use a finite row budget with explicit previous/next buttons.
- **No vertically stacked website sections or oversized hero.** Compact native toolbar, navigation, content pane, and status bar.
- **Actions remain wired to the same Tauri Rust commands.** No access to shell or insecure raw SQL.
- **Keyboard:** Command/Ctrl+K opens the site list search; Command/Ctrl+, opens Preferences.

### Left menu

| Section | Pages |
| --- | --- |
| Workspace | Overview, WordPress Sites, Module Center, Preferences |
| Engines | PHP, MariaDB, WP-CLI, HTTP Server, PHP Versions, Apache/Nginx |
| WordPress | Plugins & Themes, Database, Snapshots, PHP Logs, Maintenance, Clone/Import |
| Network & Integrations | Domains, Local SSL, Git/GitHub, Deployment, Live Sync, AI Diagnostics |

Only one section is expanded at a time; sidebar itself cannot scroll. Clicking a category reveals its pages. Pages with unavailable engines remain functional as **transparent diagnostics**, not fictitious runtime functionality.

## Implemented interactions

- **Sites:** start, stop, browser, WordPress Admin, project folder, Site Toolkit, archive, search and pagination.
- **Engine screens:** show real dependency health and installed runtime versions.
- **Module Center:** list all backend modules, show genuine ready/missing/disabled/planned state and persist supported on/off settings.
- **Site Toolkit:** plugin and theme management, read-only database schema, SQL+files snapshots, allowlisted WP-CLI maintenance.
- **PHP Logs:** 24-line pagination; no scroll.
- **Create WordPress:** two-step modal for identity and access credentials; no form/document scroll.
- **Lists:** bounded pagination for site rows, module cards, plugin/theme entries, snapshots, database tables and column schema.

## Explicitly incomplete modules

The following pages exist but must remain **planned** until they have independent backends and acceptance tests: switchable PHP versions, Apache/Nginx adapters, local domains, certificate trust and HTTPS, one-click snapshot restore, site clone/import/export, Git/GitHub, SSH deployment and rollback, live synchronization, and AI diagnostics. Adding an enabled UI button without a working and permission-checked backend is prohibited.

The previous preview DMG is **not standalone**: Ventura-compatible bundled PHP/MariaDB and the pinned WP-CLI are still dependent on real Intel Ventura source compilation and target-device validation in PR #7 and #9. A compiled interface is not proof of a working WordPress server.

## Visual acceptance checks

Test all at **1024×700, 1280×800, 1440×900**:

1. Each of the 22 module or workspace pages is reachable by opening at most one sidebar accordion group.
2. The app root/window has zero horizontal and vertical document scrollbar. No panel's text/controls are clipped at these sizes.
3. Site and module pagination does not resize the window or move the footer.
4. Modal site wizard, toolkit lists, schema inspector and logs are usable without scrolling.
5. Keyboard navigation, focus visibility, hover targets, accessibility labels and system window controls remain available.
6. All real actions display errors, state changes and progress accurately; planned modules do not allow execution.
7. On clean macOS Ventura without Homebrew, packaged runtime is reported missing until the true compatible standalone engine is bundled, not silently substituted with host binaries.

**Automated verification:** `scripts/verify-project.py` checks shell files, page IDs and command connections. GitHub `npm run build` checks TypeScript/JSX, and Intel macOS CI checks native Tauri compilation and Rust tests. Manual visual acceptance in an actual Mac window is still required before marking UI complete.
