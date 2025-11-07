#!/bin/bash

# Migration script to fix student deletion
# This adds ON DELETE CASCADE to foreign keys

set -e

DB_FILE="stuco.db"
BACKUP_FILE="stuco.db.backup.$(date +%Y%m%d_%H%M%S)"
MIGRATION_FILE="migrate_cascade_delete.sql"

echo "=== Student Deletion Fix Migration ==="
echo ""

# Check if database exists
if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file '$DB_FILE' not found!"
    exit 1
fi

# Create backup
echo "1. Creating backup: $BACKUP_FILE"
cp "$DB_FILE" "$BACKUP_FILE"
echo "   ✓ Backup created"
echo ""

# Run migration
echo "2. Running migration..."
sqlite3 "$DB_FILE" < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo "   ✓ Migration completed successfully!"
    echo ""
    echo "3. Testing deletion functionality..."
    
    # Test that foreign keys are enabled
    result=$(sqlite3 "$DB_FILE" "PRAGMA foreign_keys;")
    if [ "$result" = "1" ]; then
        echo "   ✓ Foreign keys are enabled"
    else
        echo "   ⚠ Warning: Foreign keys might not be enabled"
    fi
    
    echo ""
    echo "=== Migration Complete ==="
    echo ""
    echo "Student deletion should now work properly!"
    echo "Backup saved as: $BACKUP_FILE"
    echo ""
    echo "If you encounter any issues, restore the backup with:"
    echo "  cp $BACKUP_FILE $DB_FILE"
else
    echo "   ✗ Migration failed!"
    echo ""
    echo "Restoring from backup..."
    cp "$BACKUP_FILE" "$DB_FILE"
    echo "Database restored to previous state."
    exit 1
fi

