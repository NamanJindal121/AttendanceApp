#!/usr/bin/env bash
# One-time provisioning script for a fresh Ubuntu EC2 instance.
# Run with sudo ON the instance, from a dir containing:
#   pb_hooks/  pb_migrations/  dist/  nginx.conf  pocketbase.service
#
# Usage:  sudo bash setup-ec2.sh <domain> [pocketbase_version]
# Example: sudo bash setup-ec2.sh attendance.mycompany.com 0.28.4
#
# Prereqs (see deploy/README.md):
#   - EC2 launched, Elastic IP associated, security group opens 80/443/22
#   - DNS A record for <domain> -> the Elastic IP (must resolve before TLS step)
set -euo pipefail

APP_DIR=/opt/attendance
WEB_DIR=/var/www/attendance
DOMAIN="${1:?Usage: setup-ec2.sh <domain> [pb_version]}"
PB_VERSION="${2:-0.28.4}"

echo ">> Installing packages"
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx unzip zip awscli curl

echo ">> Creating pocketbase user + dirs"
id pocketbase &>/dev/null || useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin pocketbase
mkdir -p "${APP_DIR}/pb_data" "${WEB_DIR}" /var/www/certbot

echo ">> Downloading the Linux PocketBase binary (v${PB_VERSION})"
# The dev binary is macOS; the instance needs the matching Linux build.
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64)  PB_ARCH=amd64 ;;
  aarch64) PB_ARCH=arm64 ;;
  *) echo "Unsupported arch: ${ARCH}"; exit 1 ;;
esac
TMP_ZIP="/tmp/pocketbase_${PB_VERSION}.zip"
curl -sL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o "${TMP_ZIP}"
unzip -o "${TMP_ZIP}" pocketbase -d "${APP_DIR}"
chmod +x "${APP_DIR}/pocketbase"

echo ">> Installing hooks + migrations"
cp -r ./pb_hooks "${APP_DIR}/"
cp -r ./pb_migrations "${APP_DIR}/"
chown -R pocketbase:pocketbase "${APP_DIR}"

echo ">> Applying migrations"
sudo -u pocketbase "${APP_DIR}/pocketbase" migrate up --dir="${APP_DIR}/pb_data"

echo ">> Installing static frontend"
cp -r ./dist/* "${WEB_DIR}/"

echo ">> Installing systemd service"
cp ./pocketbase.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pocketbase

echo ">> Installing a temporary HTTP-only nginx site (so certbot can issue a cert)"
# The full SSL config references cert files that don't exist yet, which would
# make `nginx -t` fail. Serve HTTP first, obtain the cert, then swap in the
# real config that certbot's certs satisfy.
cat > /etc/nginx/sites-available/attendance <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    root ${WEB_DIR};
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location ~ ^/(api|_|iclock)/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/attendance
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ">> Obtaining TLS certificate"
if certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" \
     --non-interactive --agree-tos -m "admin@${DOMAIN}"; then
  echo ">> Installing the full SSL nginx site"
  sed "s/attendance.example.com/${DOMAIN}/g" ./nginx.conf > /etc/nginx/sites-available/attendance
  nginx -t && systemctl reload nginx
else
  echo "!! certbot failed — check the DNS A record for ${DOMAIN} resolves to this host, then re-run:"
  echo "   sudo certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"
  echo "   sudo sed 's/attendance.example.com/${DOMAIN}/g' ./nginx.conf > /etc/nginx/sites-available/attendance && sudo nginx -t && sudo systemctl reload nginx"
fi

echo ""
echo ">> Base install done. Next:"
echo "   1) Set ADMS_SHARED_SECRET in /etc/systemd/system/pocketbase.service, then:"
echo "        sudo systemctl daemon-reload && sudo systemctl restart pocketbase"
echo "   2) Create the first superuser:"
echo "        sudo -u pocketbase ${APP_DIR}/pocketbase superuser create <email> <password> --dir=${APP_DIR}/pb_data"
