# Contributing to PressForge

Katkılar memnuniyetle karşılanır. PressForge erken aşama bir kaynak önizlemesidir.

1. Değişikliği anlatan Issue açın (güvenlik açığı ise **public Issue açmayın**; `SECURITY.md` izleyin).
2. Kendi fork'unuzda `feat/`, `fix/`, `docs/` gibi bir branch açın.
3. Kod değişiklikleriyle birlikte mümkünse test ve dokümantasyon ekleyin.
4. PR açıklamasında kapsam, test komutları, riskler ve macOS sürümünü belirtin.

## Kod yapısı

- `src/` — React/TypeScript UI
- `src-tauri/src/` — Rust komutları ve yerel süreç yönetimi
- `scripts/` — doğrulama ve paketleme
- `docs/` — mimari / güvenlik / testler

## Kontroller

```bash
python3 scripts/check-version.py
python3 scripts/verify-project.py
npm install
npm run build
```

Intel Ventura derleme / smoke test sonuçları PR'da belirtilmelidir. Üçüncü taraf binary ve lisans ekleyen değişikliklerde `docs/THIRD-PARTY.md` güncellenmelidir.

Kod katkıları mevcut [MIT License](LICENSE) altında lisanslanır; patent katkıları için ayrı bir CLA uygulanmamaktadır. Başkasına ait lisanslı kodu izin ve bildirim olmadan yüklemeyin.
