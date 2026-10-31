#!/usr/bin/env python3
"""Build gate: never emit a 'standalone' DMG unless all required components are staged."""
from pathlib import Path
import subprocess
import sys
import os

ROOT=Path(__file__).resolve().parents[1]/'src-tauri/resources/runtime'
files=['php/bin/php','tools/wp-cli.phar','mariadb/bin/mariadbd','mariadb/bin/mariadb']
errors=[]
for name in files:
    path=ROOT/name
    if not path.is_file() or (name != 'tools/wp-cli.phar' and not os.access(path,os.X_OK)):
        errors.append('Eksik ya da çalıştırılamaz: '+str(path))
installer=(ROOT/'mariadb/scripts/mariadb-install-db')
if not installer.exists(): installer=ROOT/'mariadb/bin/mariadb-install-db'
if not installer.is_file(): errors.append('mariadb-install-db bulunamadı')
if sys.platform=='darwin' and not errors:
    env=dict(os.environ,PHPRC=str(ROOT/'php/etc'),PHP_INI_SCAN_DIR='')
    php=ROOT/'php/bin/php'
    for args in ([str(php),'-n','-m'],[str(php),'-n',str(ROOT/'tools/wp-cli.phar'),'--version'],[str(ROOT/'mariadb/bin/mariadbd'),'--version'],[str(ROOT/'mariadb/bin/mariadb'),'--version']):
        try:
            p=subprocess.run(args,env=env,capture_output=True,text=True,timeout=20)
            if p.returncode: errors.append(f'{args[0]} çalışmadı: {p.stderr[:300]}')
            elif args[1:]==['-n','-m']:
                missing={'mysqli','pdo_mysql'}-{x.lower().strip() for x in p.stdout.splitlines()}
                if missing: errors.append(f'Paket PHP uzantıları eksik: {missing}')
        except Exception as e: errors.append(str(e))
if errors:
    print('[BAŞARISIZ] DMG bağımsız çalışma ortamı testi:')
    for err in errors: print(' - '+err)
    raise SystemExit(1)
print('[OK] Gerekli runtime dosyaları mevcut ve temel komutlar çalışıyor.')
print('[NOT] Bağımlı dylib, MariaDB ilk başlatma ve Ventura cihaz testleri ayrıca doğrulanmalı.')
