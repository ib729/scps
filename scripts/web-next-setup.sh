#!/bin/bash
# Setup script for web-next

# Get script directory and navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_NEXT_DIR="$PROJECT_ROOT/web-next"

echo "🔧 Navigating to web-next directory..."
cd "$WEB_NEXT_DIR" || exit 1

echo "🔧 Installing dependencies..."
pnpm install

echo "🛠️  Building better-sqlite3 native bindings..."
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd "$WEB_NEXT_DIR"

echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  cd web-next && pnpm dev"
echo ""
echo "Then open http://localhost:3000 in your browser"

