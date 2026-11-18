#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
APP_USER=${SUDO_USER:-${USER:-$(id -un)}}
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  printf '%s\n' 'Usage: ./scripts/setup.sh [--systemd|--no-systemd|--https HOST]' 'Fast-forward a clean checkout from its upstream, install Debian/Ubuntu dependencies, and configure SCPS.' 'Use --https with a public IP or DNS hostname to install systemd services and configure public TLS.'
  exit 0
fi
case "$#:${1:-}" in
  0:|1:--systemd|1:--no-systemd|2:--https) ;;
  *) printf '%s\n' 'Unexpected setup arguments. See --help.' >&2; exit 2 ;;
esac
if [ "$(id -u)" -eq 0 ] && { [ -z "${SUDO_USER:-}" ] || [ "$SUDO_USER" = root ]; }; then
  printf '%s\n' 'Run setup as the intended nonroot service user with sudo access' >&2
  exit 1
fi
run_as_user() {
  if [ "$(id -u)" = "$(id -u "$APP_USER")" ]; then
    "$@"
  else
    sudo -u "$APP_USER" env PATH="$PATH" "$@"
  fi
}

installed_web=$(systemctl show --property=WorkingDirectory --value scps.service 2>/dev/null || :)
if [ -f /etc/systemd/system/scps.service.d/30-release-update.conf ]; then
  if [ "$installed_web" != "$ROOT/web-next" ] ||
     [ "$(systemctl show --property=User --value scps.service)" != "$APP_USER" ]; then
    printf '%s\n' 'The installed SCPS updater belongs to another checkout or service user.' >&2
    exit 1
  fi
  case "${1:-}" in
    ''|--systemd) ;;
    *) printf '%s\n' 'The updater already manages this installation. See docs/deployment.md for manual maintenance.' >&2; exit 1 ;;
  esac
  case "$(systemctl show --property=ActiveState --value scps-update.service)" in
    inactive|failed) ;;
    *) printf '%s\n' 'SCPS update in progress. Leaving services unchanged.'; exit 0 ;;
  esac
  if [ -e /var/lib/scps-update/request ]; then
    printf '%s\n' 'SCPS update queued. Leaving services unchanged.'
    exit 0
  fi
  if [ "$(systemctl show --property=TimeoutStopUSec --value scps.service)" = '1min 30s' ]; then
    timeout_override=/etc/systemd/system/scps.service.d/31-release-stop-timeout.conf
    if [ ! -e "$timeout_override" ]; then
      (
        config=$(mktemp)
        trap 'rm -f -- "$config"' EXIT
        printf '[Service]\nTimeoutStopSec=20s\n' > "$config"
        sudo install -D -m0644 "$config" "$timeout_override"
      )
    fi
    sudo systemctl daemon-reload
    if [ "$(systemctl show --property=TimeoutStopUSec --value scps.service)" = '1min 30s' ]; then
      printf '%s\n' 'Another systemd setting still sets the stop timeout to 90s. Check systemctl cat scps.service.' >&2
      exit 1
    fi
  fi
  web_state=$(systemctl show --property=ActiveState --value scps.service)
  if ! systemctl is-enabled --quiet scps-update.path || ! systemctl is-active --quiet scps-update.path; then
    sudo systemctl daemon-reload
    # A prior setup may have installed the launcher without switching to it yet.
    if [ "$web_state" = active ]; then sudo systemctl restart scps.service; fi
    if [ "$web_state" = inactive ] || [ "$web_state" = failed ]; then sudo systemctl start scps.service; fi
    sudo systemctl enable --now scps-update.path
  elif [ "$web_state" = inactive ] || [ "$web_state" = failed ]; then
    sudo systemctl start scps.service
  fi
  if [ "$(systemctl show --property=LoadState --value scps-update-check.timer)" = loaded ] &&
     { ! systemctl is-enabled --quiet scps-update-check.timer || ! systemctl is-active --quiet scps-update-check.timer; }; then
    sudo systemctl enable --now scps-update-check.timer
  fi
  printf '%s\n' 'SCPS systemd setup is already configured. Use Settings > Application updates to deploy.'
  exit 0
fi
download=
candidate=
cleanup() {
  [ -z "$download" ] || rm -f -- "$download"
  [ -z "$candidate" ] || run_as_user rm -rf -- "$candidate"
}
trap cleanup EXIT HUP INT TERM
NEXT_TELEMETRY_DISABLED=1
export NEXT_TELEMETRY_DISABLED
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
  *" debian "*|*" raspbian "*|*" ubuntu "*) ;;
  *) printf '%s\n' 'Debian or Ubuntu based Linux required' >&2; exit 1 ;;
esac
command -v sudo >/dev/null
if ! command -v git >/dev/null; then
  printf '%s\n' 'Git is required to update the checkout before setup. Install git and try again.' >&2
  exit 1
fi
if ! run_as_user git -C "$ROOT" rev-parse --verify --quiet '@{upstream}' >/dev/null; then
  printf '%s\n' 'Setup requires a Git branch with a configured upstream.' >&2
  exit 1
fi
changes=$(run_as_user git -C "$ROOT" status --porcelain --untracked-files=normal)
if [ -n "$changes" ]; then
  printf '%s\n' 'Setup refuses a dirty checkout. Commit or stash local changes first.' >&2
  exit 1
fi
{
  before=$(run_as_user git -C "$ROOT" rev-parse HEAD)
  run_as_user git -C "$ROOT" pull --ff-only --no-rebase
  updated_script=$(run_as_user git -C "$ROOT" diff --name-only "$before" HEAD -- scripts/setup.sh)
  # Run the new bootstrap if the update replaced the script we are reading.
  if [ -n "$updated_script" ]; then
    exec /bin/sh "$ROOT/scripts/setup.sh" "$@"
  fi
}
printf 'Detected %s\n' "${PRETTY_NAME:-${ID:-Linux}}"
if [ "$#" -eq 0 ]; then
  if [ "$installed_web" = "$ROOT/web-next" ]; then
    printf '%s\n' 'Existing SCPS systemd installation detected. Configuring its services.'
    set -- --systemd
  elif [ -f "$ROOT/.local/setup-no-systemd" ]; then
    printf '%s\n' 'Reusing the previous setup choice: no systemd services.'
    set -- --no-systemd
  elif [ -t 0 ]; then
    printf 'Install and enable the web systemd service? [y/N] '
    read -r answer || answer=
    case "$answer" in y|Y|yes|YES) set -- --systemd ;; *) set -- --no-systemd ;; esac
  else
    printf '%s\n' 'Noninteractive setup: skipping systemd services (use --systemd to enable).'
    set -- --no-systemd
  fi
fi
sudo apt-get update
sudo apt-get install -y git curl sqlite3 zstd rclone python3 build-essential pkg-config ca-certificates gnupg openssl libnfc-bin usbutils lsof udev
if [ "$1" = "--https" ] && ! command -v caddy >/dev/null; then
  caddy_version=$(LC_ALL=C apt-cache policy caddy | awk '/Candidate:/ { print $2; exit }')
  if [ -z "$caddy_version" ] || ! dpkg --compare-versions "$caddy_version" ge 2.11.4; then
    printf '%s\n' 'Install Caddy 2.11.4 or newer from https://caddyserver.com/docs/install#debian-ubuntu-raspbian, then rerun setup.' >&2
    exit 1
  fi
  sudo apt-get install -y caddy
fi
if ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a===26&&(b>13||b===13&&c>=1)?0:1)' 2>/dev/null; then
  download=$(mktemp)
  curl -fsSL -o "$download" https://deb.nodesource.com/setup_26.x
  sudo -E bash "$download"
  sudo apt-get install -y nodejs
fi
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);if(a!==26||b<13||b===13&&c<1)throw Error("Node.js >=26.13.1 <27 required")'
node -e 'const m=/Python (\d+)\.(\d+)/.exec(process.argv[1]);if(!m||!(+m[1]>3||+m[1]===3&&+m[2]>=11))throw Error("Python >=3.11 required for native addon compilation")' "$(python3 --version)"
PREFIX="$ROOT/.local/pnpm"
if ! version=$(run_as_user "$PREFIX/node_modules/.bin/pnpm" --version 2>/dev/null) || [ "$version" != 12.21.0 ]; then
  run_as_user mkdir -p "$ROOT/.local"
  candidate=$(run_as_user mktemp -d "$ROOT/.local/pnpm-stage.XXXXXX")
  if ! run_as_user npm install --prefix "$candidate" --cache "$candidate/cache" --no-save --ignore-scripts pnpm@12.21.0 ||
     ! run_as_user node "$candidate/node_modules/pnpm/install.js" ||
     ! version=$(run_as_user "$candidate/node_modules/.bin/pnpm" --version) || [ "$version" != 12.21.0 ]; then
    printf '%s\n' 'pnpm 12.21.0 bootstrap failed; application setup was not started' >&2
    exit 1
  fi
  previous=
  if [ -e "$PREFIX" ]; then
    previous=$(run_as_user mktemp -d "$ROOT/.local/pnpm.previous.XXXXXX")
    run_as_user rmdir "$previous"
    run_as_user mv "$PREFIX" "$previous"
  fi
  if ! run_as_user mv "$candidate" "$PREFIX"; then
    [ -z "$previous" ] || run_as_user mv "$previous" "$PREFIX"
    printf '%s\n' 'pnpm 12.21.0 bootstrap failed; application setup was not started' >&2
    exit 1
  fi
  candidate=
  [ -z "$previous" ] || printf 'Previous pnpm installation preserved at %s\n' "$previous"
  if ! version=$(run_as_user "$PREFIX/node_modules/.bin/pnpm" --version) || [ "$version" != 12.21.0 ]; then
    printf '%s\n' 'pnpm 12.21.0 bootstrap failed; application setup was not started' >&2
    exit 1
  fi
fi
PATH="$PREFIX/node_modules/.bin:$PATH"
export PATH
run_as_user pnpm --dir "$ROOT/web-next" install --frozen-lockfile
cd "$ROOT/web-next"
run_as_user env -u SUDO_USER node --import tsx tools/ops/setup-host.ts "$@"
if [ "$1" = "--no-systemd" ]; then
  run_as_user touch "$ROOT/.local/setup-no-systemd"
fi
