# PressForge v0.2 — Tek DMG paketleme kiti (Intel / macOS Ventura)

## Ürünün hedefi

Gerçek bir `.dmg` içinde `PressForge.app` ve **uygulamanın kendi** PHP 8.3, WP-CLI ve MariaDB 11.4 çalışma ortamları bulunmalıdır. Böyle bir `.dmg` alan son kullanıcı Rust, Cargo, Node.js, npm veya MariaDB yüklememelidir.

**Önemli:** Bu kaynak pakette PHP/MariaDB macOS ikilileri YOKTUR. Buradan Mac derleyicisi olmadan hazır DMG çıkarıldığı veya DMG'nin gerçek Ventura üzerinde çalıştığı iddia edilmemektedir. Otomasyon macOS x86_64 build runner üzerinde gerekli binary'leri hazırlayıp doğrular; tamamlanamayan aşamada DMG yerine **hata** üretir.

## İçerdiği yeni çalışmalar

- `src-tauri/resources/runtime/` Tauri bundle resources olarak `PressForge.app/Contents/Resources/runtime` dizinine eklenir.
- `src-tauri/src/lib.rs` paket içindeki PHP, WP-CLI PHAR ve MariaDB'yi öncelikli seçer; geliştirici modunda sistemdeki mevcut komutları kullanmayı sürdürür.
- Paketlenmiş MariaDB'nin veri dizini `~/Library/Application Support/dev.pressforge.desktop/database` olarak ayrılır; yalnızca 0700 izinli `~/.pressforge-private/db.sock` Unix socket ile bağlanır, TCP açılmaz. Uygulama normal kapanınca MariaDB süreci kapatılır.
- WordPress veritabanı bağlantısı otomatik olarak paketlenmiş sunucunun socket yoluna yönlendirilir.
- React formu paketlenmiş modda MariaDB yönetici parolası istemez.
- `stage-runtime-macos.py` mevcut Homebrew PHP/MariaDB kütüphane ağaçlarını kaynak kopya olarak kullanır, dinamik dylib bağımlılıklarını paket dizinine taşımayı **dener**, `otool` ile macOS minimum sürüm doğrulaması yapar ve checksum kontrolü ile WP-CLI PHAR indirir.
- `build-intel-dmg.sh` eksik veya çalışmayan PHP/WP-CLI/MariaDB tespit ettiğinde başarısız olur; yarım bir DMG'yi bağımsız diye etiketlemez.
- `build-intel-dmg.yml` GitHub Actions `macos-15-intel` runner üzerinde manuel çalıştırma desteği verir. Kod imzalama ve noter onayı yapılandırılmadı.

## Yol A — GitHub Actions ile DMG üretme

1. **Bu klasörün içeriğini** ayrı GitHub deposunun köküne push et.
2. GitHub → Actions → `Build PressForge Intel DMG (experimental)` → Run workflow.
3. Aşamalar tamamen geçerse `PressForge-Intel-macOS13-experimental` artifact'ini indir.
4. DMG'yi **macOS 13.7.8 Intel test makinesinde** çalıştır. `file`, `otool`, MariaDB ilk başlatma, WP yeni site oluşturma ve WP Admin testleri yapılmadan yayımlama.

Not: GitHub'ın `macos-15-intel` runner'ı **macOS 15** tabanlıdır; sadece `MACOSX_DEPLOYMENT_TARGET=13.0` ayarı ve Mach-O min sürüm taraması uyumluluk garantisi vermez. Homebrew formülünün eski macOS sistem çağrılarına bağımlılığı olabilir. Bu nedenle en güvenilir son derleme/test yolu gerçek Ventura x86_64 cihazında çalışmaktır.

## Yol B — Intel macOS build makinesi üzerinden

Build makinesinde geliştirme araçları (son kullanıcıda değil) hazır olmalıdır:

```bash
brew install php@8.3 mariadb@11.4
python3 scripts/stage-runtime-macos.py
bash scripts/build-intel-dmg.sh
```

Çıktı:

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/PressForge_*.dmg
```

## Eksik doğrulamalar / blokajlar

- Bu çalışma ortamı Linux'tur; Apple SDK, Intel macOS PHP/MariaDB Mach-O ikilileri ve Rust derleyicisi mevcut değil. Dolayısıyla buradan gerçek DMG **üretilemedi**.
- `stage-runtime-macos.py`, paketleme için ilk bir *experimental* relocator uygulamasıdır. Özellikle Homebrew'ün perl betikleri, mutlak yollar, MariaDB plugin arama yolu, PHP uzantılarının konumu ve `otool` ile bulunamayan `@rpath` bağımlılıkları gerçek macOS üzerinde test edilmelidir.
- Uygulamaya gömülü MariaDB ilk başlatma/yetkilendirme süreci macOS üzerinde denenmedi. `root` hesabı parolasızdır ama socket 0700 özel dizindedir ve TCP kapalıdır. Yayın öncesi tehdit modeline göre değerlendirilmelidir.
- UI/Rust için macOS tam derlemesi henüz geçmedi. Başarılı CI gereklidir.
- Apple Developer ID imzalama ve notarization olmadan üçüncü kişilere dağıtıldığında macOS Gatekeeper uyarıları görülebilir. Üretim dağıtımı öncesi imzalama/noter adımları eklenmelidir.
- PHP ve MariaDB paketlerinin lisansları (özellikle MariaDB GPL) uyarınca kaynak kodu erişimi, lisans ve üçüncü taraf bildirimleri hazırlanmalıdır. Kaynaksız binary yükleyen `.dmg` kamuya dağıtılmamalıdır.

## Yayın kriterleri (hepsi zorunlu)

- [ ] Intel macOS 13.7.8 üzerinde `.dmg` açılıyor, `PressForge.app` açılıyor
- [ ] End-user makinede önceden `php`, `wp`, `mysql`, `mariadb`, `cargo`, `node` yüklü değilken sağlıklı çalışıyor
- [ ] PHP `mysqli` / `pdo_mysql` ve WP-CLI packaged runtime üzerinde doğrulandı
- [ ] MariaDB ilk başlatma, yeniden başlatma ve socket iletişimi başarılı
- [ ] Yeni WordPress, per-site DB ve admin hesabı oluşturuluyor
- [ ] Site açma/durdurma/yeniden başlatma; WP Admin çalışıyor
- [ ] Çakışan sistem MySQL/MariaDB/PostgreSQL servisleri etkilenmiyor
- [ ] Yalıtılmış runtime, dylib ve macOS minimum sürüm gereksinimi doğrulandı
- [ ] Apple Developer ID codesign + notarization + stapling tamamlandı
- [ ] Lisanslar ve yeniden dağıtım yükümlülükleri tamamlandı
