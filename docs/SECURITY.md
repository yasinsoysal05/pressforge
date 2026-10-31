# Güvenlik modeli / üretim öncesi açıklar

## MVP korumaları

- Local HTTP yalnızca `127.0.0.1` IPv4 üzerinde dinlenir; 0.0.0.0 yok.
- Shell (`sh -c`, bash komut interpolasyonu) kullanılmaz.
- Veritabanı adı/kullanıcı adı UUID tabanlı sabit şablonda üretilir.
- MySQL yönetici parolası CLI argümanlarına konmaz: 0600 geçici `--defaults-extra-file` dosyası.
- WP CLI parola parametreleri `--prompt` ve stdin ile sağlanır.
- WP yöneticisi parolası `sites.json` içine yazılmaz; DB şifresi WP `wp-config.php` içinde bulunur.
- Arşivleme sırasında uygulamanın diğer dizinleri silinmez. Sadece uygulamanın yönettiği UUID klasörü taşınır.
- `open_site` yalnızca kayıtlı siteyi/izinli hedefi açar.
- Tauri capability yalnızca core izinlerini açar, shell API plugin kullanılmaz.

## Bilinen sınırlamalar ve riskler

1. Local PHP built-in server production güvenlik sertleştirmesine sahip değil; internete açılmamalı.
2. WordPress kurulumunun kendisi, yüklenen tema/eklenti ve yerel WP PHP kodu işletim sistemi kullanıcısının yetkileriyle çalışır. Güvenilmeyen eklentiler izole değildir.
3. MariaDB servisi sistem genelinde çalışır. DB yönetici yetkileri sadece kurulum anında gereklidir; uygulama içinde farklı DB yönetici erişimi sınırlandırılmaz.
4. WP `wp-config.php` içinde şifre bulunması WordPress gereğidir; dosya izinleri ek sertleştirme için sonraki sürümde değerlendirilmeli.
5. Site oluşturma esnasında sistem kesintisi DB kalıntısı bırakabilir. Normal hata dönüşünde rollback denenir.
6. Arşiv dosyası **şifreli değildir**, veritabanı arşivleme ile silinmez veya yedeklenmez.
7. Binary dosyaları ve sunucu prosesleri kullanıcı tarafından sağlanır; binary imza/hash doğrulama yok.
8. WordPress WP-CLI üzerinden internete bağlanır; güvenilir bağlantı ve TLS doğrulama gerekir.
9. UI'deki WP-CLI/support bağlantıları internet içeriği açar; geliştirme sitelerinin PHP kodu çalışması local-güvenlik riskidir.
10. Rust kaynak kodu henüz macOS 13'te derlenerek statik/dinamik güvenlik testinden geçirilmedi.

## v0.2 gereksinimleri

- Per-site PHP-FPM sandbox / kullanıcı privilege izolasyonu.
- DB'leri restore edebilen gerçek backup/snapshot ve otomatik rollback.
- Site manifestini `sqlite` transactional storage'a geçirme.
- Kurulum görevinde progres/iptal, aşama bazında recovery journal.
- Uygulama bundle code signing/notarization, SBOM, dependency audit, vulnerability scan.
- `wp-config.php` izinleri, güvenli credential vault entegrasyonu.
