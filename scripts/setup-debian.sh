#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_NEXT_DIR="$REPO_ROOT/web-next"
SERVICE_TEMPLATE="$REPO_ROOT/systemd/stuco-web.service"
ENV_TEMPLATE="$WEB_NEXT_DIR/.env.local.example"
ENV_FILE="$WEB_NEXT_DIR/.env.local"
DEFAULT_DB_PATH="$REPO_ROOT/stuco.db"


APP_USER="${SUDO_USER:-$USER}"

run_as_user() {
  sudo -u "$APP_USER" env PATH="$PATH" "$@"
}

ensure_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    python3 - "$ENV_FILE" "$key" "$value" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = env_path.read_text(encoding="utf-8").splitlines()

for index, line in enumerate(lines):
    if line.startswith(f"{key}="):
        lines[index] = f"{key}={value}"
        break

env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
  else
    printf '%s=%s\n' "$key" "$value" | run_as_user tee -a "$ENV_FILE" >/dev/null
  fi
}

read_env_value() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]

if not env_path.exists():
    print("")
    raise SystemExit(0)

for line in env_path.read_text(encoding="utf-8").splitlines():
    if line.startswith(f"{key}="):
        print(line.split("=", 1)[1].strip())
        break
else:
    print("")
PY
}

ensure_package() {
  sudo apt-get update
  sudo apt-get install -y "$@"
}


configure_database() {
  local resolved_database_path
  resolved_database_path="$(run_as_user node "$WEB_NEXT_DIR/lib/database-path.cjs")"
  [[ "$resolved_database_path" == /* ]] || { echo "Database resolver did not return an absolute path" >&2; return 1; }
  ensure_env_value "DATABASE_PATH" "$(node -p 'JSON.stringify(process.argv[1])' "$resolved_database_path")"
  run_as_user mkdir -p "$(dirname "$resolved_database_path")"
  if [[ ! -f "$resolved_database_path" ]]; then
    echo "Initializing SQLite database at $resolved_database_path"
    run_as_user sqlite3 "$resolved_database_path" ".read '$REPO_ROOT/migrations/schema.sql'" ".read '$WEB_NEXT_DIR/migrations/better_auth_schema.sql'"
  fi
}

main() {
echo "Preparing SCPS on Debian for user: $APP_USER"
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
echo "Repository root: $REPO_ROOT"

ensure_package git curl sqlite3 zstd rclone python3 python3-venv python3-pip build-essential ca-certificates gnupg openssl

if ! node -e 'const [a,b,c] = process.versions.node.split(".").map(Number); process.exit(a === 26 && (b > 13 || b === 13 && c >= 1) ? 0 : 1)' 2>/dev/null; then
  echo "Installing Node.js 26 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
  ensure_package nodejs
fi
node -e 'const [a,b,c] = process.versions.node.split(".").map(Number); if (a !== 26 || b < 13 || b === 13 && c < 1) throw new Error("Node.js >=26.13.1 <27 required")'
python3 -c 'import sys; assert sys.version_info >= (3, 11), "Python >=3.11 required"'

PNPM_PREFIX="$REPO_ROOT/.local/pnpm"
run_as_user npm install --prefix "$PNPM_PREFIX" --no-save pnpm@12.21.0
export PATH="$PNPM_PREFIX/node_modules/.bin:$PATH"

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

configure_database

current_auth_secret="$(read_env_value "BETTER_AUTH_SECRET")"
if [[ -z "$current_auth_secret" || "$current_auth_secret" == "replace-with-a-random-secret" ]]; then
  generated_auth_secret="$(openssl rand -base64 32 | tr -d '\n')"
  ensure_env_value "BETTER_AUTH_SECRET" "$generated_auth_secret"
  echo "Generated BETTER_AUTH_SECRET"
fi

current_signup_code="$(read_env_value "SIGNUP_CODE")"
if [[ -z "$current_signup_code" || "$current_signup_code" == "12345678" ]]; then
  generated_signup_code="$(python3 - <<'PY'
import secrets
print(f"{secrets.randbelow(10**8):08d}")
PY
)"
  ensure_env_value "SIGNUP_CODE" "$generated_signup_code"
  echo "Generated SIGNUP_CODE=$generated_signup_code"
fi

current_app_url="$(read_env_value "NEXT_PUBLIC_APP_URL")"
if [[ -z "$current_app_url" || "$current_app_url" == "http://localhost:3000" ]]; then
  ensure_env_value "NEXT_PUBLIC_APP_URL" "http://localhost:3000"
fi

current_trusted_origins="$(read_env_value "TRUSTED_ORIGINS")"
if [[ -z "$current_trusted_origins" || "$current_trusted_origins" == "http://localhost:3000" ]]; then
  ensure_env_value "TRUSTED_ORIGINS" "$(read_env_value "NEXT_PUBLIC_APP_URL")"
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
echo "   - NEXT_PUBLIC_APP_URL (replace localhost with your VPS URL)"
echo "   - TRUSTED_ORIGINS (match your VPS URL/origin)"
echo "2. Restart the service after editing env:"
echo "   sudo systemctl restart stuco-web"
echo "3. Configure encrypted R2 backups:"
echo "   ./scripts/setup-r2-crypt.sh"
echo "4. Deploy future changes from your VPS with:"
echo "   ./scripts/deploy-vps.sh"
echo
echo "Service status:"
sudo systemctl --no-pager --full status stuco-web.service || true
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
