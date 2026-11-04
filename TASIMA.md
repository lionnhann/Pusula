# Sunucu taşıma ve yedek

## Yeni sunucuya kurulum (Debian/Ubuntu VPS)
1. `sudo mkdir -p /opt/pusula` ve sunucu zip'ini oraya aç.
2. `sudo bash kur-vps.sh alanadi.duckdns.org` (Node 22+, systemd servisi ve Caddy HTTPS'i kurar).
3. `sudo nano /opt/pusula/.env` → anahtarları doldur (ADMIN_KEY ≥16 karakter, AI_KEY, R2 …), sonra `sudo systemctl restart pusula`.
4. `https://alanadi/api/health` → `"ok":true`.

## Eski sunucudan veri taşıma
Eski sunucuda `data/pusula.db` dosyasını (yedek klasöründeki bir `.db` de olur) kopyala; yeni sunucuda sunucu DURUKEN `node geri-yukle.js eski.db` çalıştır, sonra başlat. Media R2'de olduğu için ayrıca taşınmaz (aynı R2 anahtarlarını `.env`'e gir).

## Yedekler
- Yerel: her 6 saatte `data/backups/pusula-AAAAAAGG-SSDD.db` (son 14 tane tutulur). Kapatmak: `LOCAL_BACKUP=0`; klasör: `BACKUP_DIR`; adet: `BACKUP_KEEP`. Durumu `/api/health` → `localBackup` alanında gör.
- Yerel yedek aynı diskte durur: diskin kendisi bozulursa gider. Ayrıca `data/backups` klasörünü haftada bir başka yere (bilgisayarına, bulut diske) kopyala. GitHub'a şifreli yedek (BACKUP_*) mevcut olmaya devam eder.
- Geri yükleme: `sudo systemctl stop pusula && node geri-yukle.js data/backups/<dosya>.db && sudo systemctl start pusula`.
