# Versioning ve Release Policy

PressForge [Semantic Versioning 2.0.0](https://semver.org/) uygular.

- `MAJOR` — stabil API/kontrat kırılması; v0.x sırasında geçiş politikası esnektir.
- `MINOR` — geliştirme kilometre taşı.
- `PATCH` — geriye dönük uyumlu bugfix.
- Git tag'leri `vX.Y.Z` biçimindedir; kaynak dosyalarının sürümü `X.Y.Z` olur.

## Tekil sürüm kontrolü

Değiştirilecekler:
1. `package.json` → `version`
2. `src-tauri/Cargo.toml` → `[package] version`
3. `src-tauri/tauri.conf.json` → `version`
4. `CHANGELOG.md` → yeni sürüm başlığı

```bash
python3 scripts/check-version.py
python3 scripts/verify-project.py
npm install
npm run build
```

## Yayın kontrol listesi

1. Değişiklikleri review edip güvenlik taraması yap.
2. Testleri uygun Intel macOS cihazında doğrula; başarısız/yapılmamış testleri açıkça belirt.
3. `CHANGELOG.md` ve `README.md` sürüm/durum bilgilerini güncelle.
4. `main` branch'ine commit ve `vX.Y.Z` annotated tag at.
5. Kaynak ZIP'i release asset olarak ekle; dağıtılabilir DMG varsa imzalama ve notarization durumunu belgeleyerek ekle.
6. Yeni sürümü doğrula: tag, kaynak kod ve release notları eşleşsin.

> v0.2.0 bir **prerelease/alpha source preview** olarak işaretlenmelidir.
