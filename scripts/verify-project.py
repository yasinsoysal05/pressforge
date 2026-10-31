#!/usr/bin/env python3
"""Offline file/schema consistency checks. Does not compile Rust or install packages."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
required = [
    'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html',
    'src/main.tsx', 'src/styles.css', 'src-tauri/Cargo.toml',
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
for command in ('check_dependencies', 'list_sites', 'create_site', 'start_site', 'stop_site', 'archive_site', 'read_log', 'open_site', 'open_help'):
    assert f'fn {command}(' in backend or f'async fn {command}(' in backend
    assert f"'{command}'" in frontend
print('OK: file presence, JSON, Tauri configuration and command names')
print('NOT TESTED: Rust compilation, npm installation, macOS UI, MariaDB and WordPress installation')
