#!/bin/bash

set -euo pipefail

RAW_REMOTE="${RCLONE_REMOTE:-r2}"
CRYPT_REMOTE="${RCLONE_CRYPT_REMOTE:-r2-crypt}"
R2_BUCKET_PATH="${R2_PATH:-stuco-db-backups}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone is required. Install it first with: sudo apt install rclone"
  exit 1
fi

prompt() {
  local label="$1"
  local value=""
  read -r -p "$label: " value
  printf '%s' "$value"
}

prompt_secret() {
  local label="$1"
  local value=""
  read -r -s -p "$label: " value
  echo
  printf '%s' "$value"
}

echo "SCPS Cloudflare R2 encrypted backup setup"
echo
echo "This will configure:"
echo "- raw R2 remote:    $RAW_REMOTE"
echo "- encrypted remote: $CRYPT_REMOTE"
echo

ACCOUNT_ID="$(prompt "Cloudflare Account ID")"
ACCESS_KEY_ID="$(prompt "R2 Access Key ID")"
SECRET_ACCESS_KEY="$(prompt_secret "R2 Secret Access Key")"
CRYPT_PASSWORD="$(prompt_secret "rclone crypt password")"
CRYPT_PASSWORD2="$(prompt_secret "rclone crypt salt (second password, can be different)")"

ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"

rclone config delete "$RAW_REMOTE" >/dev/null 2>&1 || true
rclone config delete "$CRYPT_REMOTE" >/dev/null 2>&1 || true

rclone config create "$RAW_REMOTE" s3 \
  provider Cloudflare \
  env_auth false \
  access_key_id "$ACCESS_KEY_ID" \
  secret_access_key "$SECRET_ACCESS_KEY" \
  endpoint "$ENDPOINT" \
  region auto \
  acl private >/dev/null

rclone config create "$CRYPT_REMOTE" crypt \
  remote "${RAW_REMOTE}:${R2_BUCKET_PATH}" \
  filename_encryption standard \
  directory_name_encryption true \
  password "$CRYPT_PASSWORD" \
  password2 "$CRYPT_PASSWORD2" \
  --obscure >/dev/null

echo
echo "Configured R2 remotes successfully."
echo "Raw remote:   ${RAW_REMOTE}:${R2_BUCKET_PATH}"
echo "Crypt remote: ${CRYPT_REMOTE}:"
echo
echo "Useful commands:"
echo "  rclone ls ${CRYPT_REMOTE}:"
echo "  ./scripts/cloud_backup_r2.sh"
echo "  ./scripts/restore_from_r2.sh <backup.tar.zst>"
