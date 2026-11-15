#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
APP_USER=${SUDO_USER:-${USER:-$(id -un)}}
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  printf '%s\n' 'Usage: ./scripts/setup-debian.sh' 'Bootstrap Debian/Node/pnpm/native build tools, then invoke tools/ops/setup-debian.ts.'
  exit 0
fi
if [ "$#" -ne 0 ]; then printf '%s\n' 'Unexpected setup argument' >&2; exit 2; fi
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
  *" debian "*|*" raspbian "*) ;;
  *) printf '%s\n' 'Debian-based Linux required' >&2; exit 1 ;;
esac
command -v sudo >/dev/null
sudo apt-get update
sudo apt-get install -y git curl sqlite3 zstd rclone python3 build-essential ca-certificates gnupg openssl libnfc-bin usbutils lsof udev
if ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a===26&&(b>13||b===13&&c>=1)?0:1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);if(a!==26||b<13||b===13&&c<1)throw Error("Node.js >=26.13.1 <27 required")'
node -e 'const m=/Python (\d+)\.(\d+)/.exec(process.argv[1]);if(!m||!(+m[1]>3||+m[1]===3&&+m[2]>=11))throw Error("Python >=3.11 required for native addon compilation")' "$(python3 --version)"
PREFIX="$ROOT/.local/pnpm"
sudo -u "$APP_USER" env PATH="$PATH" npm install --prefix "$PREFIX" --no-save pnpm@12.21.0
PATH="$PREFIX/node_modules/.bin:$PATH"
export PATH
sudo -u "$APP_USER" env PATH="$PATH" pnpm --dir "$ROOT/web-next" install --frozen-lockfile
cd "$ROOT/web-next"
exec sudo -u "$APP_USER" env -u SUDO_USER PATH="$PATH" node --import tsx tools/ops/setup-debian.ts "$@"
