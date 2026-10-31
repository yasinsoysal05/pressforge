#!/usr/bin/env python3
"""Offline file/schema consistency checks. Does not compile Rust or install packages."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
required = [
    'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html',
    'src/main.tsx', 'src/styles.css', 'src/NativeWorkspace.tsx',
    'src/native-shell.css', 'src/StudioModules.tsx', 'src-tauri/Cargo.toml',
    'src-tauri/build.rs', 'src-tauri/tauri.conf.json',
    'src-tauri/src/main.rs', 'src-tauri/src/lib.rs',
    'src-tauri/src/router.php', 'src-tauri/capabilities/default.json',
    'src-tauri/icons/icon.icns', 'README.md',
]
for relative in required:
    assert (root / relative).is_file(), f'Missing {relative}'
package = json.loads((root / 'package.json').read_text())
config = json.loads((root / 'src-tauri/tauri.conf.json').read_text())
capabilities = json.loads((root / 'src-tauri/capabilities/default.json').read_text())
assert package['scripts']['tauri'] == 'tauri'
assert config['build']['devUrl'].endswith(':1420')
assert config['bundle']['macOS']['minimumSystemVersion'] == '13.0'
assert capabilities['permissions'] == ['core:default']
assert config['bundle']['targets'] == ['app', 'dmg']
backend = (root / 'src-tauri/src/lib.rs').read_text()
frontend = (root / 'src/main.tsx').read_text()
native = (root / 'src/NativeWorkspace.tsx').read_text()
tools = (root / 'src/StudioModules.tsx').read_text()
shell_css = (root / 'src/native-shell.css').read_text()
# Commands are now distributed between the app controller and distinct desktop
# module pages. Validate the actual connections instead of assuming one file
# contains every action, as it did in the old scrolling marketing layout.
for command in ('check_dependencies', 'list_sites', 'create_site', 'start_site', 'stop_site', 'archive_site', 'read_log', 'open_site', 'open_help'):
    assert f'fn {command}(' in backend or f'async fn {command}(' in backend, command
    assert f"'{command}'" in frontend + native + tools, command
assert '<NativeWorkspace' in frontend and "import { NativeWorkspace" in frontend
assert 'overflow:hidden!important' in shell_css
assert 'height:100vh' in shell_css
assert 'ns-pager' in native and 'ns-nav-children' in native
for module_id in ('php','mariadb','wpcli','webserver','extensions','database',
                  'snapshots','logs','ssl','domains','php_versions',
                  'server_adapters','clone_import','git','deployment',
                  'live_sync','diagnostics'):
    assert f"id:'{module_id}'" in native, f'Missing sidebar module page: {module_id}'
print('OK: native desktop shell, scroll-free viewport, module pages, Tauri command wiring')
print('NOT TESTED: native window rendering, Ventura device, independent PHP/MariaDB runtime')
