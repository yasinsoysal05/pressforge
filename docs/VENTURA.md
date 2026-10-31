# Intel macOS Ventura 13 uyumluluk notları

## Hedef cihaz

- Intel MacBook Pro (x86_64), macOS Ventura 13.x.
- Tauri bundle minimumSystemVersion = `13.0`.
- Hedefin build edilmesi için Intel Mac üzerinde güncel ve **Ventura ile uyumlu** Xcode Command Line Tools / Rust toolchain gerekir.

## Kritik Homebrew notu (Ekim 2026)

Homebrew destek matrisi Intel Big Sur 11–Tahoe 26 için Tier 3 durumu gösteriyor; yani Ventura 13 kurulumları yeni formüllerin hazır binary paketlerinden yararlanamayabilir. `brew install php`/`mariadb` başarılı olacağı garanti değildir. Kaynak koddan derleme ciddi zaman/maliyet doğurabilir.

- **Önerilen başlangıç:** Makinede çalışan PHP, MariaDB ve WP-CLI var mı önce `scripts/doctor.sh` ile denetleyin.
- Yüklü ve çalışan servisleri sırf güncellemek için kaldırmayın.
- Homebrew sorununda https://www.macports.org/ adresindeki Intel paketlerini değerlendirin; `/opt/local/bin` yolunu uygulama zaten tarıyor.
- WP-CLI resmi phar yöntemi kullanılabilir: https://wp-cli.org/#installing
- PHP `mysqli` uzantısı etkin olmalı; aksi halde WordPress DB bağlantısı çalışmaz.
- PHP'nin geliştirme sunucusu, multisite/HTTPS/Apache rewrite gibi ihtiyaçlar için yeterli değildir.

## PATH kontrolleri

```bash
uname -m
sw_vers -productVersion
which php && php -v
which wp && wp --version
which mariadb || which mysql
php -m | grep -i '^mysqli$'
```

macOS Finder üzerinden açılan GUI uygulamaları shell PATH'i miras almayabilir. Bu yüzden Rust runtime PATH'e `/usr/local/bin`, `/opt/homebrew/bin` ve `/opt/local/bin` öneklerini ekler.

## Risk kayıtları

1. macOS Ventura üzerinde modern Rust derleme zincirinin minimum SDK gereksinimi değişebilir.
2. Intel Homebrew paketleri güncelliğini yitirmiş veya artık bottle bulamıyor olabilir.
3. WP-CLI'nin PHP yürütücüsü, kullanılan PHP sürümüne uyumlu olmalı.
4. İkili dağıtımın başka Intel makinelerde çalışması için `.app`'ın bu hedefte derlenip test edilmesi gerekir.
5. Kod imzalama ve notarization olmadan internetten indirilen macOS uygulamaları Gatekeeper engeline takılabilir.

## Platform kaynakları

- https://v2.tauri.app/start/prerequisites/
- https://docs.brew.sh/Support-Tiers
- https://www.macports.org/
