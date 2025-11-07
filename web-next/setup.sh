#!/bin/bash
# Setup script for web-next

echo "🔧 Installing dependencies..."
pnpm install

echo "🛠️  Building better-sqlite3 native bindings..."
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd ../../../../..

echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  pnpm dev"
echo ""
echo "Then open http://localhost:3000 in your browser"

