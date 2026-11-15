#!/bin/bash

# Migration script for running database migrations
# Usage: ./run_migration.sh <migration_file.sql>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
[[ $# == 1 ]] || { echo "Usage: $0 <migration_file.sql>" >&2; exit 1; }
if [[ -f "$1" ]]; then
    MIGRATION_FILE="$1"
elif [[ -f "$PROJECT_ROOT/migrations/$1" ]]; then
    MIGRATION_FILE="$PROJECT_ROOT/migrations/$1"
else
    echo "Migration file not found: $1" >&2
    exit 1
fi
DB_FILE="$(node "$PROJECT_ROOT/web-next/lib/database-path.cjs")"
BACKUP_FILE="${DB_FILE}.backup.$(date +%Y%m%d_%H%M%S).$$"
python3 "$SCRIPT_DIR/sqlite_snapshot.py" snapshot "$DB_FILE" "$BACKUP_FILE"
echo "Validated pre-migration snapshot: $BACKUP_FILE"
sqlite3 -bail "$DB_FILE" < "$MIGRATION_FILE"
echo "Migration complete. For deliberate recovery, stop writers and use scps-cli import-db."
