# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir. Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) esas alınarak hazırlanmıştır; proje [Semantic Versioning](https://semver.org/) uygular.

## [Unreleased]

### Planned
- Intel macOS Ventura uçtan uca WordPress kurulum testleri.
- Taşınabilir PHP/MariaDB runtime doğrulaması ve güvenli backup/restore.
- Kod imzalama ve Apple notarization.

## [0.2.0] - 2026-10-31

### Added
- PressForge bağımsız Tauri/React/TypeScript/Rust kaynak kodu.
- Yerel WordPress site yaşam döngüsü için deneysel backend ve UI.
- PHP / WP-CLI / MariaDB çalışma ortamını paketleme temeli.
- Intel macOS DMG üretim ve runtime doğrulama betikleri.
- Deneysel GitHub Actions DMG workflow.
- Açık kaynak lisansı, mimari ve güvenlik belgeleri.

### Known limitations
- macOS native uygulama derlemesi ve gerçek WordPress kurulumu henüz doğrulanmadı.
- DMG için tam taşınabilir ikililerin lisans ve uyumluluk denetimi tamamlanmadı.
- İmza / noter onayı yok; üretim kullanımı önerilmez.

## [0.1.0] - 2026-10-31

### Added
- İlk yerel WordPress studio MVP kaynak kodu.
- Geliştirme ortamı kontrolleri ve temel yerel PHP router.

> Not: `v0.1.0` önceki yerel prototipin tarihsel kaydıdır; GitHub'a geriye dönük etiket olarak oluşturulmayacaktır. İlk GitHub etiketi `v0.2.0` olacaktır.
