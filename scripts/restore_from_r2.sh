#!/bin/bash

# Usage: ./restore_from_r2.sh <backup_filename.tar.zst> --writers-stopped
set -euo pipefail
umask 077
if [[ $# != 2 || "$2" != "--writers-stopped" || "$1" == */* || "$1" == "." || "$1" == ".." || "$1" != *.tar.zst ]]; then
    echo "Usage: $0 <backup_filename.tar.zst> --writers-stopped" >&2
    exit 1
fi
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet stuco-web.service; then
    echo "Refusing restore while stuco-web.service is active" >&2
    exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RCLONE_CRYPT_REMOTE="${RCLONE_CRYPT_REMOTE:-r2-crypt}"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir "$STAGING/extracted"
rclone copyto "${RCLONE_CRYPT_REMOTE}:$1" "$STAGING/archive.tar.zst"
SOURCE="$(python3 "$SCRIPT_DIR/sqlite_snapshot.py" extract "$STAGING/archive.tar.zst" "$STAGING/extracted")"
mkdir -p "$PROJECT_ROOT/db_backups"
PRE_RESTORE="$PROJECT_ROOT/db_backups/pre_restore_backup_$(date +%Y%m%d_%H%M%S)_$$.tar.zst"
"$SCRIPT_DIR/web_backup.sh" "$PRE_RESTORE"
"$PROJECT_ROOT/scps-cli" import-db "$SOURCE" --yes
echo "Restore complete; pre-restore snapshot: $PRE_RESTORE"
