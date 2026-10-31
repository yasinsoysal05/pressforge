# Security Policy

## Destek durumu

**v0.2.0 alpha** güvenlik düzeltme garantisi olmayan deneysel kaynak önizlemesidir. Gerçek müşteri verileriyle veya internete açık ortamlarda çalıştırılmamalıdır.

## Güvenlik açığı bildirme

Gizli bir güvenlik açığı bildirmek için GitHub deposundaki **Security → Report a vulnerability** seçeneğini kullanın **(depo sahibi Private Vulnerability Reporting'i etkinleştirdiyse)**. Bu özellik yoksa açık Issue'ya exploit, anahtar veya özel bilgi koymayın; önce depo sahibiyle güvenli iletişim kanalı talep edin.

Raporunuzda ilgili sürümü, yeniden üretim adımlarını ve etkiyi belirtin. Güvenlik açığı yayınlamadan önce makul düzeltme süreci için koordinasyon önerilir.

## Varsayımlar

- PHP geliştirme sunucusu yalnızca `127.0.0.1` üzerinde çalışmalıdır.
- MariaDB socket'i ile uygulama veri dizini kısıtlı erişimle yönetilmelidir.
- WordPress yönetici parolaları log ve issue içeriklerine yazılmamalıdır.
- macOS paketleme/dağıtım aşamalarındaki üçüncü taraf bileşenler denetlenmelidir.
