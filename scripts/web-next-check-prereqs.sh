#!/bin/bash
# Check prerequisites for building better-sqlite3 native bindings
# Works on Debian-based Linux (Raspberry Pi OS)

set -e

echo "🔍 Checking build prerequisites for better-sqlite3..."
echo ""

OS_TYPE="$(uname -s)"
MISSING_DEPS=()

case "$OS_TYPE" in
  Linux*)
    echo "Platform: Linux"
    echo ""
    
    # Check for build-essential
    if ! command -v gcc &> /dev/null; then
      echo "❌ gcc not found (install build-essential)"
      MISSING_DEPS+=("build-essential")
    else
      echo "✅ gcc: $(gcc --version | head -n1)"
    fi
    
    if ! command -v g++ &> /dev/null; then
      echo "❌ g++ not found (install build-essential)"
      MISSING_DEPS+=("build-essential")
    else
      echo "✅ g++: $(g++ --version | head -n1)"
    fi
    
    if ! command -v make &> /dev/null; then
      echo "❌ make not found (install build-essential)"
      MISSING_DEPS+=("build-essential")
    else
      echo "✅ make: $(make --version | head -n1)"
    fi
    
    # Check for python3
    if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      echo "❌ Python >=3.11 required"
      MISSING_DEPS+=("python3")
    else
      echo "✅ python3: $(python3 --version)"
    fi
    
    # Check for pkg-config
    if ! command -v pkg-config &> /dev/null; then
      echo "⚠️  pkg-config not found (recommended)"
    else
      echo "✅ pkg-config: $(pkg-config --version)"
    fi
    ;;
    
  *)
    echo "⚠️  Unknown platform: $OS_TYPE"
    echo "This script is designed for Linux systems."
    ;;
esac

echo ""

# Check for Node.js
if ! node -e 'const [a,b,c] = process.versions.node.split(".").map(Number); process.exit(a === 26 && (b > 13 || b === 13 && c >= 1) ? 0 : 1)' 2>/dev/null; then
  echo "❌ Node.js >=26.13.1 <27 required"
  MISSING_DEPS+=("nodejs")
else
  echo "✅ Node.js: $(node --version)"
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null || [[ "$(pnpm --version)" != "12.21.0" ]]; then
  echo "❌ pnpm 12.21.0 required"
  MISSING_DEPS+=("pnpm")
else
  echo "✅ pnpm: $(pnpm --version)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
  echo "✅ All prerequisites are installed!"
  echo ""
  echo "You can now run:"
  echo "  pnpm install"
  echo ""
  echo "The postinstall script will automatically build better-sqlite3 bindings."
  exit 0
else
  echo "❌ Missing prerequisites detected!"
  echo ""
  
  case "$OS_TYPE" in
    Linux*)
      echo "To install on Debian/Ubuntu/Raspberry Pi OS:"
      echo ""
      echo "  sudo apt update"
      if [[ " ${MISSING_DEPS[@]} " =~ " build-essential " ]]; then
        echo "  sudo apt install -y build-essential"
      fi
      if [[ " ${MISSING_DEPS[@]} " =~ " python3 " ]]; then
        echo "  sudo apt install -y python3"
      fi
      if [[ " ${MISSING_DEPS[@]} " =~ " pnpm " ]]; then
        echo "  npm install --prefix .local/pnpm --no-save pnpm@12.21.0"
        echo '  export PATH="$PWD/.local/pnpm/node_modules/.bin:$PATH"'
      fi
      ;;
  esac
  
  echo ""
  exit 1
fi

