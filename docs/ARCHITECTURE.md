# PressForge — Teknik Mimari Karar Kaydı (ADR-001)

## Katmanlar

```text
┌─────────────────────────────────────────────────────────────────┐
│ React + TypeScript                                              │
│ Proje listesi · Yeni site formu · Ortam kontrolü · Log viewer   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Tauri IPC (izinli invoke komutları)
┌──────────────────────▼──────────────────────────────────────────┐
│ Rust / Tauri 2                                                   │
│ check_dependencies · list_sites · create_site · start_site      │
│ stop_site · open_site · archive_site · read_log                  │
│                                                                 │
│ Validation → operations Mutex → Metadata JSON → Child manager  │
└─────────────────────┬─────────────────────────┬─────────────────┘
                      │ std::process::Command   │ TCP 127.0.0.1
            ┌─────────▼───────────┐   ┌─────────▼──────────────┐
            │ WP-CLI / PHP CLI    │   │ PHP -S (dev server)    │
            │ Core download       │   │ Per-site child process │
            │ Config / Install    │   │ WordPress rewrite      │
            └─────────┬───────────┘   └────────────────────────┘
                      │
            ┌─────────▼──────────────────────────────────────────┐
            │ Yerel MariaDB/MySQL servisi                        │
            │ Her siteye ayrı DB + user + 128-bit parola         │
            └────────────────────────────────────────────────────┘
```

## Tasarım tercihleri

- **Tauri v2:** Electron benzeri UI, Rust tabanlı OS yetkileri; macOS'un sistem WebKit'i kullanılır.
- **SPA React:** yalnızca statik frontend; sunucu yönetimi ve sır saklama sorumluluğu Rust tarafında.
- **Yerel servis keşfi:** PATH araması; Intel Brew `/usr/local/bin`, Apple Silicon `/opt/homebrew/bin`, MacPorts `/opt/local/bin`.
- **Site izolasyonu:** ayrı WordPress dizini, DB, DB kullanıcısı ve HTTP portu. Bu bir tam sanal makine/container izolasyonu değildir.
- **Kayıt deposu:** atomik güncellenen `sites.json`; küçük MVP'de yeterli, ileride SQLite.
- **Kritik operasyon kilidi:** `Mutex<()>` site create/stop/archive komutlarını sıralar, port yarışını önler.
- **Subprocess ömrü:** PHP `Child` handle Tauri state içinde yaşar; normal app kapanışında kill/wait.
- **PHP router:** gerçek dosyayı yerleşik sunucuya bırakır, rewrite isteklerini WP front controller'a yönlendirir.
- **MVP reverse proxy yok:** `127.0.0.1:port` şeması, hosts dosyası ve root izinlerinden kaçınır.

## Create site sekansı

1. Form doğrulama (`title`, WP admin kullanıcı/şifre/e-posta, locale, DB yönetici).
2. `php`, `wp`, `mariadb` executable keşfi; DB `SELECT 1` bağlantısı.
3. Uygun port / UUID / proje klasörü tahsisi.
4. `wp core download` (resmî kaynak, WP-CLI kendi cache/MD5 denetimi).
5. MariaDB `CREATE DATABASE`; `CREATE USER`; `GRANT` yalnızca ilgili DB.
6. `wp config create --prompt=dbpass` üzerinden DB şifresi stdin'den iletilir.
7. `wp core install --prompt=admin_password` üzerinden WordPress admin şifresi stdin'den iletilir.
8. `sites.json` kaydı, PHP geliştirme sunucusu başlatma.
9. Kurulum hata verirse oluşturulan dosyaları ve yeni DB/kullanıcıyı temizlemeye çalışır.

## Bilinçli olarak kapsam dışında

- TLS, wildcard `.test` domainleri, ayrı php-fpm havuzları, mysql servis lifecycle.
- Remote SSH sync, multisite, WordPress migration, domain search-replace.
- Veritabanı snapshot alma ve Restore UI.
- Müşterinin production sitesine yazma. Bütün MVP işlemleri yalnızca local.

## İleri mimari (v0.2+)

`EnvironmentProvider` arayüzü:

```text
interface EnvironmentProvider {
  provision(config): Result<Environment>
  start(siteId): Result<Health>
  stop(siteId): Result<void>
  inspect(siteId): Result<Diagnostics>
  snapshot(siteId): Result<Snapshot>
}
```

MVP doğrudan sistem komutlarına bağlıdır. Sonraki sürümde yerel PHP-FPM sağlayıcısı, MacPorts/Brew provider, sandbox, Nginx proxy ve uzun işlemler için event tabanlı progress kanalı eklenmelidir.
