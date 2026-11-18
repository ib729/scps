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
if [ -f /etc/systemd/system/scps.service.d/30-release-update.conf ]; then
  printf '%s\n' 'Disable the SCPS release updater before running in-place setup. See docs/deployment.md.' >&2
  exit 1
fi
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
  if [ -t 0 ]; then
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
