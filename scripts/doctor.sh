#!/usr/bin/env bash
set -u
printf '\nPressForge - Intel macOS Ön Kontrol\n=================================\n'
printf 'Platform: '; uname -srm
if command -v sw_vers >/dev/null; then printf 'macOS: '; sw_vers -productVersion; fi
printf '\n'
for command_name in node npm cargo rustc php wp; do
  if command -v "$command_name" >/dev/null 2>&1; then
    printf '[OK] %-10s %s\n' "$command_name" "$(command -v "$command_name")"
  else
    printf '[EKSİK] %-10s\n' "$command_name"
  fi
done
if command -v mariadb >/dev/null 2>&1; then
  printf '[OK] mariadb    %s\n' "$(command -v mariadb)"
elif command -v mysql >/dev/null 2>&1; then
  printf '[OK] mysql      %s\n' "$(command -v mysql)"
else
  printf '[EKSİK] mariadb/mysql istemcisi\n'
fi
if command -v php >/dev/null 2>&1; then
  if php -m 2>/dev/null | grep -iq '^mysqli$'; then
    printf '[OK] PHP mysqli modülü\n'
  else
    printf '[EKSİK] PHP mysqli modülü\n'
  fi
fi
printf '\nMariaDB sunucusu ayrıca çalışıyor olmalı. Bu betik değişiklik yapmaz.\n\n'
