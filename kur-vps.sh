#!/usr/bin/env bash
# Debian/Ubuntu VPS için tek komutla kurulum:  sudo bash kur-vps.sh alan.adi.org
# Önce sunucu zip'ini /opt/pusula içine aç, sonra bu betiği çalıştır.
set -e
DOMAIN="${1:?Kullanım: sudo bash kur-vps.sh alan.adi.org}"
cd /opt/pusula
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; }
NV=$(node -p "process.versions.node.split('.')[0]"); [ "$NV" -ge 22 ] || { echo "Node 22+ gerekli (node:sqlite). Mevcut: $NV"; exit 1; }
id pusula >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin pusula
[ -f .env ] || { cp .env.example .env; sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" .env; echo ".env oluşturuldu: anahtarlarını doldur (nano /opt/pusula/.env)"; }
mkdir -p data && chown -R pusula:pusula /opt/pusula
sed "s#/opt/pusula#/opt/pusula#g" pusula.service > /etc/systemd/system/pusula.service
if ! command -v caddy >/dev/null; then apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | tee /etc/apt/sources.list.d/caddy.list; apt-get update; apt-get install -y caddy; fi
sed "s#pusulakisiselasistan.duckdns.org#$DOMAIN#" Caddyfile.ornek > /etc/caddy/Caddyfile
systemctl daemon-reload && systemctl enable --now pusula && systemctl restart caddy
sleep 3; curl -s http://127.0.0.1:3000/api/health | head -c 300; echo
echo "Hazır: https://$DOMAIN/api/health  (80 ve 443 portları açık olmalı)"
