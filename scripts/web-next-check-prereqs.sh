#!/bin/bash
# Check prerequisites for building better-sqlite3 native bindings
# Works on macOS and Debian-based Linux (Raspberry Pi OS)

set -e

echo "🔍 Checking build prerequisites for better-sqlite3..."
echo ""

OS_TYPE="$(uname -s)"
MISSING_DEPS=()

case "$OS_TYPE" in
  Darwin*)
    echo "Platform: macOS"
    echo ""
    
    # Check for Xcode Command Line Tools
    if ! xcode-select -p &> /dev/null; then
      echo "❌ Xcode Command Line Tools not found"
      MISSING_DEPS+=("xcode-clt")
    else
      echo "✅ Xcode Command Line Tools: $(xcode-select -p)"
    fi
    
    # Check for clang
    if ! command -v clang &> /dev/null; then
      echo "❌ clang compiler not found"
      MISSING_DEPS+=("clang")
    else
      echo "✅ clang: $(clang --version | head -n1)"
    fi
    ;;
    
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
    if ! command -v python3 &> /dev/null; then
      echo "❌ python3 not found"
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
    echo "This script supports macOS and Linux only."
    ;;
esac

echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found"
  MISSING_DEPS+=("nodejs")
else
  echo "✅ Node.js: $(node --version)"
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm not found"
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
    Darwin*)
      echo "To install on macOS:"
      echo ""
      if [[ " ${MISSING_DEPS[@]} " =~ " xcode-clt " ]] || [[ " ${MISSING_DEPS[@]} " =~ " clang " ]]; then
        echo "  xcode-select --install"
      fi
      if [[ " ${MISSING_DEPS[@]} " =~ " pnpm " ]]; then
        echo "  npm install -g pnpm"
        echo "  # or: brew install pnpm"
      fi
      ;;
      
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
        echo "  npm install -g pnpm"
        echo "  # or: curl -fsSL https://get.pnpm.io/install.sh | sh -"
      fi
      ;;
  esac
  
  echo ""
  exit 1
fi

