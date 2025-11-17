#!/bin/bash

# Restore STUCO Database from Cloudflare R2 (using rclone)
# Usage: ./restore_from_r2.sh <backup_filename.tar.gz>

set -e

# Check if backup filename is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_filename.tar.gz>"
    echo ""
    echo "Example: $0 stuco_backup_20241209_020000.tar.gz"
    echo ""
    echo "To list available backups in R2:"
    echo "  rclone ls \$RCLONE_REMOTE:\$R2_PATH/"
    exit 1
fi

BACKUP_FILE="$1"
LOCAL_BACKUP_DIR="db_backups"
LOCAL_PATH="${LOCAL_BACKUP_DIR}/${BACKUP_FILE}"

# Rclone Configuration
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_PATH="${R2_PATH:-stuco-db-backups}"

echo "============================================================"
echo "STUCO Database Restore from Cloudflare R2 (rclone)"
echo "============================================================"
echo "Backup: $BACKUP_FILE"
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "❌ Error: rclone is not installed!"
    echo ""
    echo "Install with:"
    echo "  sudo apt install rclone"
    echo "or download from: https://rclone.org/downloads/"
    exit 1
fi

# Check if rclone remote is configured
if ! rclone listremotes | grep -q "^${RCLONE_REMOTE}:$"; then
    echo "❌ Error: rclone remote '${RCLONE_REMOTE}' not configured!"
    echo ""
    echo "Configure rclone with:"
    echo "  rclone config"
    echo ""
    echo "Or set RCLONE_REMOTE environment variable to your remote name:"
    echo "  export RCLONE_REMOTE=your-remote-name"
    exit 1
fi

# Create local backup directory
mkdir -p "$LOCAL_BACKUP_DIR"

# Download from R2
echo "------------------------------------------------------------"
echo "Step 1: Downloading from Cloudflare R2"
echo "------------------------------------------------------------"

rclone copy "${RCLONE_REMOTE}:${R2_PATH}/${BACKUP_FILE}" "$LOCAL_BACKUP_DIR/" --progress

if [ $? -eq 0 ]; then
    echo "✓ Download complete: $LOCAL_PATH"
else
    echo "❌ Download failed!"
    exit 1
fi

echo ""

# Backup current database before restore
echo "------------------------------------------------------------"
echo "Step 2: Backing up current database"
echo "------------------------------------------------------------"

if [ -f "stuco.db" ]; then
    CURRENT_BACKUP="db_backups/pre_restore_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    tar -czf "$CURRENT_BACKUP" stuco.db stuco.db-wal stuco.db-shm 2>/dev/null || tar -czf "$CURRENT_BACKUP" stuco.db 2>/dev/null
    echo "✓ Current database backed up to: $CURRENT_BACKUP"
else
    echo "ℹ No existing database to backup"
fi

echo ""

# Extract the backup
echo "------------------------------------------------------------"
echo "Step 3: Restoring database"
echo "------------------------------------------------------------"

# Detect project root dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Extract
tar -xzf "$LOCAL_PATH"

if [ $? -eq 0 ]; then
    echo "✓ Database restored successfully!"
else
    echo "❌ Extraction failed!"
    exit 1
fi

echo ""
echo "============================================================"
echo "✓ Restore Complete!"
echo "============================================================"
echo ""
echo "Database restored from: $BACKUP_FILE"
echo ""
echo "To verify the restore:"
echo "  sqlite3 stuco.db '.tables'"
echo "  sqlite3 stuco.db 'SELECT COUNT(*) FROM students;'"
echo ""

