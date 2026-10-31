#!/usr/bin/env python3
"""Stage a macOS Intel runtime for a self-contained PressForge bundle.

Runs ON a macOS x86_64 build machine. It never modifies Homebrew installations.
Copies PHP/MariaDB kegs, relocates referenced external dylibs into runtime/lib,
checks Mach-O minimum deployment target, and stages a checksum-verified WP-CLI.

This is a build tool; success must be followed by actual Ventura end-to-end testing.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'src-tauri/resources/runtime'
PORTABLE_LIB = RUNTIME / 'lib'
TARGET = '13.0'
SYSDIRS = ('/usr/lib/', '/System/Library/')
MACHO = ('Mach-O ', 'Mach-O universal')


def run(*args, check=True):
    return subprocess.run(args, capture_output=True, text=True, check=check).stdout.strip()


def die(message):
    raise SystemExit(f'[HATA] {message}')


def brew_prefix(formula):
    try:
        return Path(run('brew', '--prefix', formula)).resolve(strict=True)
    except Exception as ex:
        die(f'{formula} Homebrew paketi bulunamadı: {ex}')


def runtime_prefix(env_var, formula):
    # A release build must be able to stage runtimes built from source on
    # Ventura without relying on an unsupported newer Homebrew bottle.
    override = os.environ.get(env_var, '').strip()
    if override:
        prefix = Path(override).expanduser().resolve(strict=True)
        if not prefix.is_dir():
            die(f'{env_var} bir dizin olmalı: {prefix}')
        print(f'[RUNTIME] {env_var}: {prefix}')
        return prefix
    return brew_prefix(formula)


def macho(file):
    if file.is_symlink() or not file.is_file():
        return False
    try:
        return 'Mach-O' in run('file', '-b', str(file))
    except Exception:
        return False


def versions_ok(file):
    info = run('file', '-b', str(file))
    if 'x86_64' not in info and 'universal' not in info.lower():
        die(f'Intel x86_64 olmayan Mach-O: {file} ({info})')
    lines = run('otool', '-l', str(file)).splitlines()
    for i, row in enumerate(lines):
        if row.strip() in ('cmd LC_BUILD_VERSION', 'cmd LC_VERSION_MIN_MACOSX'):
            key = 'minos' if row.strip() == 'cmd LC_BUILD_VERSION' else 'version'
            for part in lines[i:i+8]:
                m = re.search(r'\b'+key+r'\s+(\d+\.\d+(?:\.\d+)?)', part)
                if m:
                    version = tuple((list(map(int,m.group(1).split('.'))) + [0,0,0])[:3])
                    if version > (13,0,0):
                        die(f'Ventura 13 üzerinde çalışmayacak binary: {file}, minos={m.group(1)}')
                    break


def deps(file):
    lines = run('otool', '-L', str(file)).splitlines()[1:]
    return [r.strip().split(' (', 1)[0] for r in lines if r.strip()]


def rpaths(file):
    lines = run('otool', '-l', str(file)).splitlines()
    found=[]
    for i,line in enumerate(lines):
        if line.strip() == 'cmd LC_RPATH':
            for x in lines[i:i+6]:
                m=re.search(r'path (\S+)', x)
                if m:
                    found.append(m.group(1)); break
    return found


def resolve_install_name(dep, parent):
    if dep.startswith('/'): return Path(dep).resolve()
    if dep.startswith('@loader_path/'):
        return (parent.parent / dep.removeprefix('@loader_path/')).resolve()
    if dep.startswith('@executable_path/'):
        # keg binaries refer to their own exe dir, not the host PressForge executable
        return (parent.parent / dep.removeprefix('@executable_path/')).resolve()
    if dep.startswith('@rpath/'):
        name=dep.removeprefix('@rpath/')
        for item in rpaths(parent):
            candidate=resolve_install_name(item+'/'+name, parent)
            if candidate and candidate.exists(): return candidate
        # standard Homebrew common dynamic libraries, tried only when unambiguous
        matches=list(Path('/usr/local').glob(f'opt/*/lib/{Path(name).name}'))
        if len(matches)==1: return matches[0].resolve()
    return None


def inside(file):
    try: return file.resolve().is_relative_to(RUNTIME.resolve())
    except (ValueError,OSError): return False


def stage_binary(file, extra):
    # Copy only external dependencies, keep existing keg binaries in their keg tree.
    resolved=file.resolve()
    if inside(resolved): return resolved
    if str(resolved).startswith(SYSDIRS): return resolved
    if not resolved.is_file(): die(f'Bir Mach-O bağımlılığı bulunamadı: {file}')
    short=hashlib.sha256(str(resolved).encode()).hexdigest()[:10]+'-'+resolved.name
    target=PORTABLE_LIB / short
    if not target.exists():
        shutil.copy2(resolved, target)
        target.chmod(target.stat().st_mode | 0o200)
        extra.append(target)
    return target


def copy_and_fix_symlinks(source, dest):
    shutil.copytree(source, dest, symlinks=True, dirs_exist_ok=True)
    # Homebrew kegs may include absolute links to own keg; remap inside staged tree.
    for link in dest.rglob('*'):
        if not link.is_symlink(): continue
        target=os.readlink(link)
        if target.startswith('/'):
            resolved=Path(target).resolve()
            if resolved.is_relative_to(source):
                replacement=dest/resolved.relative_to(source)
                link.unlink()
                link.symlink_to(os.path.relpath(replacement, link.parent))
            else:
                # Homebrew ships PHP's optional PECL development directory as a
                # machine-local symlink. It is not part of WordPress core runtime.
                if dest.name == 'php' and link.relative_to(dest).as_posix() == 'pecl':
                    print(f'[PHP] PECL geliştirme symlink kaldırıldı: {link} -> {target}')
                    link.unlink()
                    continue
                # All other external symlinks remain a hard packaging failure.
                die(f'Paket dışında kalan mutlak sembolik bağ: {link} -> {target}')


def stage_phar():
    # A rotating "latest" download without a pinned digest makes source tags
    # non-reproducible. Do not replace this check with the remote latest SHA.
    locked = json.loads((ROOT/'runtime-lock.json').read_text(encoding='utf-8'))['wp_cli']
    phar_url = locked['source']
    sha = locked['sha512'].lower()
    allowed = 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'
    if phar_url != allowed or len(sha) != 128 or any(c not in '0123456789abcdef' for c in sha):
        die('WP-CLI runtime-lock.json geçersiz; resmi kaynak ve SHA-512 gerekli')
    print('[WP-CLI] Sabit SHA-512 ile kontrol edilen PHAR indiriliyor')
    req=urllib.request.Request(phar_url,headers={'User-Agent':'PressForge-packager/0.2'})
    with urllib.request.urlopen(req,timeout=90) as resp: content=resp.read()
    digest=hashlib.sha512(content).hexdigest()
    if digest!=sha:
        die('WP-CLI dosyası kilitlenen SHA-512 ile eşleşmiyor; sürümü bilinçli güncelleyin')
    tools=RUNTIME/'tools'; tools.mkdir(parents=True,exist_ok=True)
    (tools/'wp-cli.phar').write_bytes(content)
    print(f'[WP-CLI] OK: {len(content):,} bytes, pinned sha512={digest[:16]}...')


def main():
    if sys.platform!='darwin' or os.uname().machine!='x86_64':
        die('Bu hazırlama betiği Intel x86_64 macOS üzerinde çalıştırılmalıdır.')
    if shutil.which('brew') is None and not (
        os.environ.get('PRESSFORGE_PHP_PREFIX') and os.environ.get('PRESSFORGE_MARIADB_PREFIX')
    ):
        die('Homebrew yoksa PRESSFORGE_PHP_PREFIX ve PRESSFORGE_MARIADB_PREFIX gerekli')
    php=runtime_prefix('PRESSFORGE_PHP_PREFIX', os.environ.get('PRESSFORGE_PHP_FORMULA','php@8.3'))
    maria=runtime_prefix('PRESSFORGE_MARIADB_PREFIX', os.environ.get('PRESSFORGE_MARIADB_FORMULA','mariadb@11.4'))
    if RUNTIME.exists(): shutil.rmtree(RUNTIME)
    RUNTIME.mkdir(parents=True)
    PORTABLE_LIB.mkdir()
    for label, source in (('php',php),('mariadb',maria)):
        print(f'[{label}] {source} -> {RUNTIME/label}')
        copy_and_fix_symlinks(source, RUNTIME/label)
    # MariaDB's integration tests are not required by the installed database
    # daemon. In particular test_pam_modules may target a newer macOS SDK.
    test_plugins = RUNTIME / 'mariadb/lib/plugin/test_pam_modules'
    if test_plugins.exists():
        print(f'[MariaDB] Excluding test-only PAM modules: {test_plugins}')
        shutil.rmtree(test_plugins)
    stage_phar()
    needed=(RUNTIME/'php/bin/php',RUNTIME/'mariadb/bin/mariadbd',RUNTIME/'mariadb/bin/mariadb')
    for file in needed:
        if not file.exists(): die(f'Kritik dosya eksik: {file}')
    scripts=RUNTIME/'mariadb/scripts/mariadb-install-db'
    alt=RUNTIME/'mariadb/bin/mariadb-install-db'
    if not scripts.exists() and not alt.exists(): die('mariadb-install-db eksik')
    todo=[p for p in RUNTIME.rglob('*') if macho(p)]
    incompatible = []
    for item in todo:
        try:
            versions_ok(item)
        except SystemExit as error:
            incompatible.append(str(error))
    if incompatible:
        for message in incompatible[:40]:
            print('[UYUMSUZ] ' + message, file=sys.stderr)
        if len(incompatible) > 40:
            print(f'[UYUMSUZ] ... {len(incompatible)-40} ek dosya', file=sys.stderr)
        die(f'{len(incompatible)} Intel Mach-O dosyası Ventura 13 hedefini karşılamıyor; paketlemeyi durdurdum.')
    extra=[]; visited=set(); fixups=0
    while todo:
        file=todo.pop()
        if file in visited: continue
        visited.add(file)
        versions_ok(file)
        install_id=run('otool','-D',str(file),check=False).splitlines()
        own_id=install_id[1].strip() if len(install_id)>1 else ''
        for dep in deps(file):
            # otool -L on a dylib contains its own install-name ID as the first row.
            if own_id and dep == own_id: continue
            if dep.startswith(SYSDIRS): continue
            resolved=resolve_install_name(dep,file)
            if resolved is None or not resolved.exists(): die(f'{file}: çözümlenemeyen dylib: {dep}')
            if resolved.is_relative_to(RUNTIME): target=resolved
            else: target=stage_binary(resolved,extra)
            if target not in visited and macho(target): todo.append(target)
            changed='@loader_path/'+os.path.relpath(target,file.parent)
            if dep!=changed:
                run('install_name_tool','-change',dep,changed,str(file))
                fixups+=1
        # Clear any dylib install-name ID which references a build machine path.
        install_id=run('otool','-D',str(file),check=False).splitlines()
        if len(install_id)>1 and install_id[1].strip():
            run('install_name_tool','-id','@rpath/'+file.name,str(file))
    # Runtime PHP must supply WordPress MySQL driver without depending on global php.ini.
    php_bin=RUNTIME/'php/bin/php'
    php_env=dict(os.environ)
    php_env['PHPRC']=str(RUNTIME/'php/etc')
    php_env['PHP_INI_SCAN_DIR']=''
    modules=subprocess.run([str(php_bin),'-n','-m'],capture_output=True,text=True,env=php_env)
    if modules.returncode: die(f'Paket PHP çalıştırılamıyor: {modules.stderr[:500]}')
    loaded={s.strip().lower() for s in modules.stdout.splitlines()}
    missing={'mysqli','pdo','pdo_mysql','openssl','mbstring','curl'}-loaded
    if missing: die(f'Paket PHP -n -m içinde eksik uzantılar: {sorted(missing)}. PHP derlemesi güncellenmeli.')
    wp=subprocess.run([str(php_bin),'-n',str(RUNTIME/'tools/wp-cli.phar'),'--version'],capture_output=True,text=True,env=php_env)
    if wp.returncode: die(f'Paket WP-CLI çalıştırılamıyor: {wp.stderr[:500]}')
    print(f'[OK] WP-CLI: {wp.stdout.strip()}')
    print(f'[OK] Mach-O dosyaları doğrulandı: {len(visited)}, bağımlılık düzeltmeleri: {fixups}, ek dylib: {len(extra)}')
    print('NOT: MariaDB başlatma testi ve macOS 13 gerçek cihaz testi ayrıca gereklidir.')

if __name__=='__main__': main()
