# PressForge

**Open-source WordPress development studio for macOS.**  
**Intel macOS Ventura (13.x) hedefli, Tauri 2 + Rust + React + TypeScript tabanlı bağımsız bir yerel geliştirme ortamı.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0--alpha-orange)
![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey)

> **Development preview / Deneysel kaynak sürümü**  
> v0.2.0 **çalıştığı doğrulanmış bir DMG değildir.** Intel macOS üzerinde Tauri derlemesi, MariaDB'nin taşınabilir paket olarak çalışması ve uçtan uca WordPress kurulumu henüz doğrulanmadı. Production veya kritik müşteri siteleri için kullanmayın.

## PressForge nedir?

PressForge, WordPress sitelerini yerel bilgisayarda oluşturmayı ve yönetmeyi amaçlayan **LocalWP'den bağımsız** açık kaynak bir masaüstü uygulamasıdır. LocalWP/WordPress Studio kodu kopyalanmamıştır. Projenin kendi kaynak kodu **MIT** lisanslıdır; paketlenecek PHP, MariaDB, WordPress ve WP-CLI gibi bağımlılıklar kendi lisanslarına tabidir.

İlk aşamadaki kapsam:

- React tabanlı masaüstü paneli: yerel projeleri listeleme, oluşturma, başlatma/durdurma ve arşivleme.
- Rust/Tauri arka ucu: WP-CLI üzerinden WordPress ilk kurulum işlemleri ve yerel PHP süreç yönetimi.
- PHP hata günlükleri, WP Admin bağlantısı ve proje klasörünü açma.
- Ayrı bir yerel MariaDB veri dizini ve Unix socket tabanlı bağlantı hedefi.
- Intel macOS `.dmg` üretimi için **deneysel** GitHub Actions iş akışı.

**Henüz mevcut olmayan / doğrulanmamışlar:** notarized ve imzalı kurulum, otomatik güncelleme, veri aktarımı ve geri yükleme garantisi, çoklu PHP sürüm izolasyonu, Nginx/Apache, canlı deployment, tam entegrasyon testleri.

## Uygulama mimarisi

```text
PressForge Desktop (Tauri 2 + React + TypeScript)
     | Tauri invoke (Rust command handlers)
     v
Site Manager (Rust)
  |- WP-CLI (WordPress bootstrap)
  |- PHP process / local HTTP server
  |- MariaDB process / isolated Unix socket (bundled runtime goal)
  `- Logs and site metadata
```

**Önemli:** `php -S` yalnızca yerel geliştirme içindir ve public network'e açılmamalıdır. Geliştirme modunda sisteminizde PHP, WP-CLI, MariaDB ve Rust yüklü olmalıdır. Son kullanıcıya bağımlılıksız `.dmg` dağıtımı *hedeflenmektedir*; henüz kanıtlanmadı.

## Hızlı başlangıç (geliştirici)

Gereksinimler: macOS 13+ (Intel `x86_64` hedefi), Xcode Command Line Tools, Node.js, npm, Rust toolchain, PHP + `mysqli`, WP-CLI, MariaDB sunucu/istemci.

```bash
bash scripts/doctor.sh
npm install
npm run tauri dev
```

Sadece web arayüzünü kontrol etmek için:

```bash
npm install
npm run dev
```

Bu komutlar WordPress motorunun çalıştığını kanıtlamaz. Yerel geliştirme döngüsü ve test senaryoları için [Test Plan](docs/TEST-PLAN.md) belgesine bakın.

## Intel macOS DMG (deneysel)

GitHub Actions sekmesinden **Build PressForge Intel DMG (experimental)** iş akışını manuel başlatabilirsiniz. İş akışı taşınabilir PHP/MariaDB dosyaları hazırlayamıyorsa bilerek başarısız olur; eksik motorlu bir DMG'yi başarılı gibi sunmaz.

Yerel Intel Mac üzerinde:

```bash
python3 scripts/stage-runtime-macos.py
bash scripts/build-intel-dmg.sh
```

Paketleme ayrıntıları ve macOS 13 uyumluluk riskleri: [docs/DMG-PAKETLEME.md](docs/DMG-PAKETLEME.md).

## Sürümleme

[Semantic Versioning](https://semver.org/) uygulanır:

- `v0.2.0` — ilk yayımlanacak **alpha/kaynak önizleme**; sürüm etiketi ile kod sürümü eşleşir.
- `v0.x` — API ve davranışlar değişebilir.
- Gelecekte `v0.3.0`, `v0.4.0` ve stabil hale geldiğinde `v1.0.0`.
- Değişiklikler [CHANGELOG.md](CHANGELOG.md) dosyasına kaydedilir. Sürüm uyumu `python3 scripts/check-version.py` ile kontrol edilir.

Her sürüm için bir Git etiketi ve GitHub Release oluşturulması önerilir. Kaynak ZIP, release asset olarak eklenir; GitHub zaten tag'e ait otomatik kaynak ZIP oluşturur.

## Katkıda bulunma

Issue ve pull request kabul edilir. Önce [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) ve [SECURITY.md](SECURITY.md) dosyalarını okuyun. Hataları yeniden üretme adımları, macOS sürümü, mimari ve logları gizli bilgilerden arındırarak ekleyin.

## Yol haritası

| Aşama | Hedef | Durum |
|---|---|---|
| v0.2.0 | Açık kaynak yapı, deneysel DMG Build Kit | **Kaynak önizleme** |
| v0.3.x | Intel Ventura gerçek cihaz üzerinde end-to-end kurulum | Planlandı |
| v0.4.x | PHP + MariaDB runtime izolasyonu, güvenli backup / restore | Planlandı |
| v0.5.x | Site klonlama, import/export, otomatik testler | Planlandı |
| v0.6.x | GitHub ve staging/deployment entegrasyonları | Planlandı |
| v1.0.0 | İmzalı/notarized sürüm, stabilite ve güvenlik denetimi | Uzun vadeli hedef |

## Belgeler

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — mimari
- [docs/VENTURA.md](docs/VENTURA.md) — Intel Ventura notları
- [docs/SECURITY.md](docs/SECURITY.md) — teknik güvenlik değerlendirmeleri
- [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) — üçüncü taraf dağıtım lisansları
- [docs/DMG-PAKETLEME.md](docs/DMG-PAKETLEME.md) — DMG paketleme
- [docs/TEST-PLAN.md](docs/TEST-PLAN.md) — kabul testleri
- [VERSIONING.md](VERSIONING.md) — sürüm yayın prosedürü

## Lisans

PressForge kaynak kodu [MIT License](LICENSE) altında yayımlanır. Üçüncü taraf paketler ve bağımlılıkların lisansları, MIT kapsamına otomatik olarak girmez. Özellikle MariaDB/WordPress kaynak ve dağıtım yükümlülükleri için [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) dosyasına bakın.

---
**English summary:** PressForge is an independent, MIT-licensed open-source macOS WordPress development desktop project built with Tauri 2, Rust, React and TypeScript. Version 0.2.0 is an experimental **source preview**, not a tested distributable DMG. Development requires local PHP, MariaDB and WP-CLI; bundling a portable runtime is work in progress.