#!/bin/bash

# Web Backup Script
# Usage: ./web_backup.sh <output_file>

set -e

OUTPUT_FILE="$1"
DB_FILE="stuco.db"
DB_WAL="stuco.db-wal"
DB_SHM="stuco.db-shm"

if [ -z "$OUTPUT_FILE" ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi

# Ensure we are in the project root (where the script is called from or relative to it)
# Assuming the script is run from the project root or we need to find the db.
# For now, let's assume the caller sets the CWD correctly (which we will do in the API).

if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file '$DB_FILE' not found."
    exit 1
fi

# Create tar archive
# We suppress stderr for the tar command regarding missing files if WAL/SHM don't exist
tar -czf "$OUTPUT_FILE" "$DB_FILE" "$DB_WAL" "$DB_SHM" 2>/dev/null || tar -czf "$OUTPUT_FILE" "$DB_FILE"

echo "Backup created at $OUTPUT_FILE"
