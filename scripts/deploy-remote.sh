#!/bin/bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <user>@<host> [branch]"
  exit 1
fi

TARGET_HOST="$1"
BRANCH="${2:-main}"
REMOTE_PATH="${SCPS_REMOTE_PATH:-\$HOME/scps}"

ssh "$TARGET_HOST" "cd \"$REMOTE_PATH\" && ./scripts/deploy-vps.sh \"$BRANCH\""
