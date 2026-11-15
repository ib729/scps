#!/bin/bash

# Usage: ./web_backup.sh <output_file>
set -euo pipefail
umask 077
[[ $# == 1 ]] || { echo "Usage: $0 <output_file>" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$(node "$SCRIPT_DIR/../web-next/lib/database-path.cjs")"
OUTPUT_FILE="$(realpath -m "$1")"
STAGING="$(mktemp -d)"
PENDING=""
trap 'rm -rf "$STAGING"; [[ -z "$PENDING" ]] || rm -f "$PENDING"' EXIT
PENDING="$(mktemp "$(dirname "$OUTPUT_FILE")/.scps-backup.XXXXXX")"
python3 "$SCRIPT_DIR/sqlite_snapshot.py" snapshot "$DB_FILE" "$STAGING/stuco.db"
export ZSTD_CLEVEL="${ZSTD_CLEVEL:-15}"
export ZSTD_NBTHREADS="${ZSTD_NBTHREADS:-0}"
tar --zstd -cf "$PENDING" -C "$STAGING" stuco.db
mv "$PENDING" "$OUTPUT_FILE"
echo "Backup created at $OUTPUT_FILE"
