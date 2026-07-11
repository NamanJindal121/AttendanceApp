#!/usr/bin/env bash
# Pull the latest code and redeploy on the EC2 instance.
# Run from the repo root ON the instance:  sudo bash deploy/update.sh
#
# Safe to run anytime — it rebuilds the frontend, syncs hooks + migrations,
# applies any new migrations, and restarts PocketBase. Idempotent.
set -euo pipefail

APP_DIR=/opt/attendance
WEB_DIR=/var/www/attendance
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ">> Pulling latest code"
git -C "${REPO_ROOT}" pull --ff-only

echo ">> Building frontend"
( cd "${REPO_ROOT}/frontend" && npm ci && npm run build )

echo ">> Deploying static files"
rm -rf "${WEB_DIR:?}/"*
cp -r "${REPO_ROOT}/frontend/dist/"* "${WEB_DIR}/"

echo ">> Syncing hooks + migrations"
cp -r "${REPO_ROOT}/backend/pb_hooks/." "${APP_DIR}/pb_hooks/"
cp -r "${REPO_ROOT}/backend/pb_migrations/." "${APP_DIR}/pb_migrations/"
chown -R pocketbase:pocketbase "${APP_DIR}/pb_hooks" "${APP_DIR}/pb_migrations"

echo ">> Applying any new migrations"
sudo -u pocketbase "${APP_DIR}/pocketbase" migrate up --dir="${APP_DIR}/pb_data"

echo ">> Restarting PocketBase"
systemctl restart pocketbase

echo ">> Done. Live at your domain. (Static files are served directly; a hard"
echo "   refresh may be needed to bypass the PWA/service-worker cache.)"
