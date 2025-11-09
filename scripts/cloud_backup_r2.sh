#!/bin/bash

# Cloudflare R2 Database Backup Script for STUCO (using rclone)
# Uploads SQLite database to Cloudflare R2 storage with local retention
# Usage: ./cloud_backup_r2.sh

set -e

# Configuration
DB_FILE="stuco.db"
DB_WAL="stuco.db-wal" 
DB_SHM="stuco.db-shm"
LOCAL_BACKUP_DIR="db_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="stuco_backup_${TIMESTAMP}"

# Rclone Configuration
# Set this to your rclone remote name (default: "r2")
# Configure with: rclone config
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_PATH="${R2_PATH:-stuco-db-backups}"

echo "============================================================"
echo "STUCO Cloudflare R2 Database Backup (rclone)"
echo "============================================================"
echo "Timestamp: $TIMESTAMP"
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "❌ Error: rclone is not installed!"
    echo ""
    echo "Install with:"
    echo "  sudo apt install rclone"
    echo "or download from: https://rclone.org/downloads/"
    echo ""
    echo "After installation, configure rclone for Cloudflare R2:"
    echo "  rclone config"
    echo "  - Choose: s3"
    echo "  - Provider: Cloudflare"
    echo "  - Enter your R2 Access Key ID and Secret Access Key"
    echo "  - Endpoint: https://<account-id>.r2.cloudflarestorage.com"
    exit 1
fi

# Check if rclone remote is configured
if ! rclone listremotes | grep -q "^${RCLONE_REMOTE}:$"; then
    echo "❌ Error: rclone remote '${RCLONE_REMOTE}' not configured!"
    echo ""
    echo "Configure rclone with:"
    echo "  rclone config"
    echo ""
    echo "Create a remote named '${RCLONE_REMOTE}' with the following settings:"
    echo "  - Storage: s3"
    echo "  - Provider: Cloudflare"
    echo "  - Access Key ID: <your R2 access key>"
    echo "  - Secret Access Key: <your R2 secret key>"
    echo "  - Region: auto"
    echo "  - Endpoint: https://<account-id>.r2.cloudflarestorage.com"
    echo ""
    echo "Alternatively, set RCLONE_REMOTE environment variable to your remote name:"
    echo "  export RCLONE_REMOTE=your-remote-name"
    exit 1
fi

# Check if database exists
if [ ! -f "$DB_FILE" ]; then
    echo "❌ Error: Database file '$DB_FILE' not found!"
    exit 1
fi

# Create local backup directory
mkdir -p "$LOCAL_BACKUP_DIR"

# Step 1: Create compressed backup
echo "------------------------------------------------------------"
echo "Step 1: Creating compressed backup"
echo "------------------------------------------------------------"
BACKUP_FILE="${LOCAL_BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Create tar archive (suppress warnings for missing WAL/SHM files)
if tar -czf "$BACKUP_FILE" "$DB_FILE" "$DB_WAL" "$DB_SHM" 2>/dev/null; then
    echo "✓ All database files included"
elif tar -czf "$BACKUP_FILE" "$DB_FILE" 2>/dev/null; then
    echo "⚠ Warning: WAL/SHM files not found, backed up main DB only"
else
    echo "❌ Error: Failed to create backup archive"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Local backup created: $BACKUP_FILE ($BACKUP_SIZE)"
echo ""

# Step 2: Upload to Cloudflare R2
echo "------------------------------------------------------------"
echo "Step 2: Uploading to Cloudflare R2"
echo "------------------------------------------------------------"

echo "Remote: ${RCLONE_REMOTE}:${R2_PATH}/"
echo "File: ${BACKUP_NAME}.tar.gz"

# Upload to R2 using rclone
rclone copy "$BACKUP_FILE" "${RCLONE_REMOTE}:${R2_PATH}/" \
    --progress \
    --metadata-set "timestamp=${TIMESTAMP}" \
    --metadata-set "type=database" \
    --metadata-set "project=stuco"

if [ $? -eq 0 ]; then
    echo "✓ Upload successful!"
else
    echo "❌ Upload failed!"
    echo "Local backup preserved at: $BACKUP_FILE"
    exit 1
fi

echo ""

# Step 3: Report backup statistics
echo "------------------------------------------------------------"
echo "Step 3: Backup Summary"
echo "------------------------------------------------------------"

# Count local backups
LOCAL_COUNT=$(find "$LOCAL_BACKUP_DIR" -name "*.tar.gz" | wc -l)
LOCAL_TOTAL_SIZE=$(du -sh "$LOCAL_BACKUP_DIR" | cut -f1)

echo "Local backups: $LOCAL_COUNT files ($LOCAL_TOTAL_SIZE total)"
echo "Latest backup: $BACKUP_FILE ($BACKUP_SIZE)"
echo ""

# List R2 backups
echo "Checking R2 bucket contents..."
R2_BACKUPS=$(rclone ls "${RCLONE_REMOTE}:${R2_PATH}/" 2>/dev/null | wc -l || echo "0")
echo "R2 backups: $R2_BACKUPS files"
echo ""

echo "============================================================"
echo "✓ Backup Complete!"
echo "============================================================"
echo ""
echo "Local:  $BACKUP_FILE"
echo "Remote: ${RCLONE_REMOTE}:${R2_PATH}/${BACKUP_NAME}.tar.gz"
echo ""
echo "To restore from this backup:"
echo "  cd /home/qiss/stuco"
echo "  tar -xzf $BACKUP_FILE"
echo ""
echo "To list all R2 backups:"
echo "  rclone ls ${RCLONE_REMOTE}:${R2_PATH}/"
echo ""
echo "To download a backup:"
echo "  rclone copy ${RCLONE_REMOTE}:${R2_PATH}/FILENAME.tar.gz db_backups/"
echo ""

# Optional: Clean up old local backups (disabled by default)
# Uncomment the following lines to keep only the last 30 days of local backups
# echo "Cleaning up old local backups (keeping last 30 days)..."
# find "$LOCAL_BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
# echo "✓ Cleanup complete"

