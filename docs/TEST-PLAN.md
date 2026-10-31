# macOS üzerinde MVP kabul testi (manuel)

Bütün testleri Ventura 13 Intel x86_64 makinesinde uygulayın. Başka platformda GUI testi bu kriteri karşılamaz.

## 0. Hazırlık

```bash
uname -m                  # beklenen x86_64
sw_vers -productVersion   # beklenen 13.x
bash scripts/doctor.sh
npm install
npm run tauri dev
```

## 1. Fonksiyonel testler

- [ ] Uygulama `PressForge` penceresini açıyor; boş workspace görünüyor.
- [ ] PHP / WP-CLI / MariaDB / mysqli satırlarında doğru durum görünüyor.
- [ ] Geçersiz WP şifre, kullanıcı adı, e-posta reddediliyor.
- [ ] `tr_TR` WordPress sitesi oluşturuluyor; `sites.json` kaydı geliyor.
- [ ] `http://127.0.0.1:<port>` WordPress anasayfasını açıyor.
- [ ] `/wp-admin/` login başarılı; şifresi uygulama metadata dosyasında yok.
- [ ] WordPress'te Settings → Permalinks → Post name seçilince örnek post URL'si çalışıyor.
- [ ] Site durdurulunca port kapatılıyor, yeniden başlatılınca açılıyor.
- [ ] İkinci site farklı port ve veritabanı kullanıyor.
- [ ] Site klasörü macOS Finder'da açılıyor.
- [ ] PHP logları görüntüleniyor.
- [ ] Uygulama tamamen kapanınca PHP sunucu child süreçleri sonlanıyor.
- [ ] Site arşivlenince listeden kalkıyor; dosyalar `archive/` içinde duruyor; DB korunuyor.

## 2. Hata senaryoları

- [ ] MariaDB kapatılıp site kurulunca açık hata gösteriliyor, yeni site listede oluşmuyor.
- [ ] İlgili port başka process tarafından tutuluyorsa PHP server başlatma uyarısı geliyor.
- [ ] WordPress indirmesi sırasında ağ kesilirse hata gösteriliyor, eksik site kayıt listesine girmiyor.
- [ ] `.app` Finder'dan açıldığında PHP/DB/WP binary path bulunuyor.
- [ ] Kurulum şifreleri uygulama loglarında, `sites.json` içinde veya process argument listesinde görünmüyor.
- [ ] `npm run tauri build` sonunda macOS `.app` ve DMG üretiliyor; Gatekeeper test prosedürü ayrıca uygulanıyor.

## 3. Tamamlanma kriteri

Bu liste macOS cihazda işaretlenmeden **doğrulanmış çalışan sürüm** etiketi kullanılmamalı.
