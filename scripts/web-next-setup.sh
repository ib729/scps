#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_NEXT_DIR="$PROJECT_ROOT/web-next"
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

require_command() {
  local command_name="$1"
  local help_text="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    echo "$help_text"
    exit 1
  fi
}

echo "Preparing SCPS web environment"
echo "Detected platform: ${OS_NAME} ${ARCH_NAME}"

require_command node "Install Node.js 20 or newer before running this script."
require_command pnpm "Enable Corepack or install pnpm before running this script."
require_command python3 "Install Python 3 so native modules can build correctly."

if [[ "$OS_NAME" == "Linux" ]]; then
  require_command make "Install build-essential or an equivalent C/C++ toolchain."
  require_command g++ "Install g++ so better-sqlite3 can compile."
elif [[ "$OS_NAME" == "Darwin" ]]; then
  require_command xcodebuild "Install Xcode Command Line Tools with xcode-select --install."
fi

cd "$WEB_NEXT_DIR"

echo "Installing dependencies..."
pnpm install

echo "Rebuilding better-sqlite3 native bindings..."
pnpm rebuild better-sqlite3

echo "Setup complete."
echo "Start the app with: cd web-next && pnpm dev"
