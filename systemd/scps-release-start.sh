#!/bin/sh
set -eu
current=${SCPS_UPDATE_DIR:?Set SCPS_UPDATE_DIR}/current
trial=/run/scps-update/trial
if [ -L "$trial" ]; then
  current=$trial
fi
release=$(realpath -- "$current")
cd -- "$release/web-next"
exec "$1" --import tsx server.ts
