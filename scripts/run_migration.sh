#!/bin/bash

# Migration script for running database migrations
# Usage: ./run_migration.sh <migration_file.sql>

set -e

DB_FILE="stuco.db"
BACKUP_FILE="stuco.db.backup.$(date +%Y%m%d_%H%M%S)"

# Check if migration file argument is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <migration_file.sql>"
    echo ""
    echo "Available migrations in migrations/:"
    ls -1 migrations/*.sql 2>/dev/null || echo "  (no migration files found)"
    exit 1
fi

# Determine migration file path
if [ -f "$1" ]; then
    MIGRATION_FILE="$1"
elif [ -f "migrations/$1" ]; then
    MIGRATION_FILE="migrations/$1"
else
    echo "Error: Migration file '$1' not found!"
    echo "Looked in: current directory and migrations/"
    exit 1
fi

echo "=== Database Migration ==="
echo "Migration: $MIGRATION_FILE"
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
    echo "3. Verifying database integrity..."
    
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
    echo "Migration applied successfully!"
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

