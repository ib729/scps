#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_NEXT_DIR="$REPO_ROOT/web-next"
SERVICE_TEMPLATE="$REPO_ROOT/systemd/stuco-web.service"
ENV_TEMPLATE="$WEB_NEXT_DIR/.env.local.example"
ENV_FILE="$WEB_NEXT_DIR/.env.local"

if [[ ! -f /etc/os-release ]]; then
  echo "This script only supports Debian-based Linux hosts."
  exit 1
fi

. /etc/os-release

if [[ "${ID:-}" != "debian" && "${ID_LIKE:-}" != *"debian"* ]]; then
  echo "This script only supports Debian-based Linux hosts."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required."
  exit 1
fi

APP_USER="${SUDO_USER:-$USER}"

run_as_user() {
  sudo -u "$APP_USER" "$@"
}

ensure_package() {
  sudo apt-get update
  sudo apt-get install -y "$@"
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi

  node -p "Number(process.versions.node.split('.')[0])"
}

echo "Preparing SCPS on Debian for user: $APP_USER"
echo "Repository root: $REPO_ROOT"

ensure_package git curl sqlite3 zstd rclone python3 python3-venv python3-pip build-essential ca-certificates gnupg

if (( "$(node_major_version)" < 20 )); then
  echo "Installing Node.js 20 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  ensure_package nodejs
fi

corepack enable >/dev/null 2>&1 || sudo corepack enable

if ! command -v pnpm >/dev/null 2>&1; then
  corepack prepare pnpm@latest --activate >/dev/null 2>&1 || sudo corepack prepare pnpm@latest --activate
fi

if [[ ! -d "$REPO_ROOT/.venv" ]]; then
  run_as_user python3 -m venv "$REPO_ROOT/.venv"
fi

run_as_user "$REPO_ROOT/.venv/bin/pip" install --upgrade pip
run_as_user "$REPO_ROOT/.venv/bin/pip" install -r "$REPO_ROOT/requirements.txt"

run_as_user pnpm --dir "$WEB_NEXT_DIR" install --frozen-lockfile

if [[ ! -f "$ENV_FILE" ]]; then
  run_as_user cp "$ENV_TEMPLATE" "$ENV_FILE"
  echo "Created $ENV_FILE from template."
fi

run_as_user pnpm --dir "$WEB_NEXT_DIR" build

SERVICE_FILE="/etc/systemd/system/stuco-web.service"

sed \
  -e "s|__RUN_USER__|$APP_USER|g" \
  -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  "$SERVICE_TEMPLATE" | sudo tee "$SERVICE_FILE" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable stuco-web.service
sudo systemctl restart stuco-web.service

echo
echo "SCPS Debian setup complete."
echo
echo "Next steps:"
echo "1. Edit $ENV_FILE"
echo "   Required values:"
echo "   - DATABASE_PATH"
echo "   - BETTER_AUTH_SECRET"
echo "   - NEXT_PUBLIC_APP_URL"
echo "   - TRUSTED_ORIGINS"
echo "   - SIGNUP_CODE"
echo "2. Restart the service after editing env:"
echo "   sudo systemctl restart stuco-web"
echo "3. Configure encrypted R2 backups:"
echo "   ./scripts/setup-r2-crypt.sh"
echo "4. Deploy future changes from your VPS with:"
echo "   ./scripts/deploy-vps.sh"
echo
echo "Service status:"
sudo systemctl --no-pager --full status stuco-web.service || true
