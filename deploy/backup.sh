#!/usr/bin/env bash
# Periodic backup of the PocketBase data dir to S3.
# Run from cron on the EC2 instance, e.g. hourly during working hours:
#   0 9-19 * * 1-5  /opt/attendance/backup.sh >> /var/log/attendance-backup.log 2>&1
set -euo pipefail

DATA_DIR="/opt/attendance/pb_data"
BUCKET="s3://your-attendance-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="/tmp/pb_backup_${STAMP}.zip"

# PocketBase can back up itself consistently; fall back to zipping the dir.
if /opt/attendance/pocketbase backup "pb_backup_${STAMP}.zip" --dir="${DATA_DIR}" 2>/dev/null; then
  # PB writes into pb_data/backups/
  aws s3 cp "${DATA_DIR}/backups/pb_backup_${STAMP}.zip" "${BUCKET}/"
else
  zip -r "${ARCHIVE}" "${DATA_DIR}" >/dev/null
  aws s3 cp "${ARCHIVE}" "${BUCKET}/"
  rm -f "${ARCHIVE}"
fi

echo "backup ${STAMP} uploaded to ${BUCKET}"
