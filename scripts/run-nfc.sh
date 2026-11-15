#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT/web-next"
exec node --env-file-if-exists="$ROOT/.env.broadcaster" --import tsx hardware/tap-broadcaster.ts "$@"
