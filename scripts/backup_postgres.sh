#!/bin/bash
# backup_postgres.sh — Automated PostgreSQL backup script for enterprise-wms
#
# Usage:
#   ./scripts/backup_postgres.sh
#
# Environment variables (can be set or overridden in shell):
#   POSTGRES_CONTAINER  — Docker container name (default: ewms-postgres-1)
#   POSTGRES_USER       — Database user          (default: ewms)
#   POSTGRES_DB         — Database name          (default: ewms_db)
#
# Crontab examples:
#   Run daily at 2:00 AM:
#     0 2 * * * /opt/enterprise-wms/scripts/backup_postgres.sh >> /var/log/ewms-backup.log 2>&1
#
#   Run every 6 hours:
#     0 */6 * * * /opt/enterprise-wms/scripts/backup_postgres.sh >> /var/log/ewms-backup.log 2>&1
#
# To install the crontab entry:
#   crontab -e
#   (then add one of the lines above)

set -e

BACKUP_DIR="/backups/postgres"
CONTAINER_NAME="${POSTGRES_CONTAINER:-ewms-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-ewms}"
POSTGRES_DB="${POSTGRES_DB:-ewms_db}"
MAX_BACKUPS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."
docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"
echo "[$(date)] Backup saved: $BACKUP_FILE"

# Remove old backups, keeping only the MAX_BACKUPS most recent
ls -t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
echo "[$(date)] Cleanup done. Current backups:"
ls -lh "$BACKUP_DIR"
