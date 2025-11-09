#!/bin/bash
# Quick database reset script
# This is a simpler alternative to reset_db.py

set -e

DB_FILE="stuco.db"
DB_WAL="stuco.db-wal"
DB_SHM="stuco.db-shm"
SCHEMA_FILE="migrations/schema.sql"
BACKUP_DIR="db_backups"

echo "============================================================"
echo "STUCO Database Reset Script (Quick Mode)"
echo "============================================================"
echo ""
echo "⚠️  WARNING: This will DELETE all existing data!"
echo ""

# Check if schema exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Error: schema.sql not found!"
    exit 1
fi

# Confirm
read -p "Type 'yes' to confirm: " confirmation
if [ "$confirmation" != "yes" ]; then
    echo "Reset cancelled."
    exit 0
fi

echo ""
echo "------------------------------------------------------------"
echo "Step 1: Backing up existing database"
echo "------------------------------------------------------------"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup if database exists
if [ -f "$DB_FILE" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="$BACKUP_DIR/stuco_backup_${TIMESTAMP}.db"
    cp "$DB_FILE" "$BACKUP_PATH"
    echo "✓ Backup created: $BACKUP_PATH"
else
    echo "No existing database to backup."
fi

echo ""
echo "------------------------------------------------------------"
echo "Step 2: Removing old database files"
echo "------------------------------------------------------------"

for file in "$DB_FILE" "$DB_WAL" "$DB_SHM"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo "Removed: $file"
    fi
done

echo ""
echo "------------------------------------------------------------"
echo "Step 3: Creating fresh database"
echo "------------------------------------------------------------"

# Initialize database
python3 init_db.py

echo ""
echo "============================================================"
echo "✓ Database reset complete!"
echo "============================================================"
echo ""
echo "Your database is now ready for production."
echo "Backup location: $BACKUP_DIR/"
echo ""

