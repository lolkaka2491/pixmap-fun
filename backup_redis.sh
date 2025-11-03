#!/bin/bash

BACKUP_DIR="/root/pixelplanet/backups"

REDIS_DUMP="/var/lib/redis/dump.rdb"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

BACKUP_FILE="${BACKUP_DIR}/dump_${TIMESTAMP}.rdb"

cp "$REDIS_DUMP" "$BACKUP_FILE"

find "$BACKUP_DIR" -name "dump_*.rdb" -type f -mtime +30 -delete

echo "$(date): Backup created: $BACKUP_FILE" >> "${BACKUP_DIR}/backup.log" 