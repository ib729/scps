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

if ! command -v zstd >/dev/null 2>&1; then
    echo "Error: zstd is required to create .tar.zst backups."
    exit 1
fi

# Balanced high-compression profile:
# - level 15 gives strong compression without the extreme CPU/RAM hit of ultra modes
# - multithreading helps stronger machines, while zstd scales down on weaker ones
export ZSTD_CLEVEL="${ZSTD_CLEVEL:-15}"
export ZSTD_NBTHREADS="${ZSTD_NBTHREADS:-0}"

# Create tar archive with zstd compression.
# Suppress stderr so missing WAL/SHM sidecars do not fail the normal backup path.
tar --zstd -cf "$OUTPUT_FILE" "$DB_FILE" "$DB_WAL" "$DB_SHM" 2>/dev/null || tar --zstd -cf "$OUTPUT_FILE" "$DB_FILE"

echo "Backup created at $OUTPUT_FILE"
