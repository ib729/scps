#!/bin/bash
# Start dev server with proper NFC broadcaster coordination
# Ensures USB device is reset and broadcaster starts cleanly

cd "$(dirname "$0")/.."

echo "🔧 Starting development environment with NFC support..."
echo ""

# Stop broadcaster if running
echo "📡 Stopping tap-broadcaster service..."
sudo systemctl stop tap-broadcaster 2>/dev/null || true
sleep 1

# Kill any rogue broadcaster processes
echo "🧹 Cleaning up any stale processes..."
sudo pkill -f "tap-broadcaster.py" 2>/dev/null || true
sleep 1

# Reset USB device
echo "🔄 Resetting USB device..."
./scripts/reset-usb-nfc.sh || echo "⚠️  USB reset failed, continuing..."
sleep 2

# Start dev server in background
echo "🚀 Starting Next.js dev server..."
cd web-next
pnpm dev &
DEV_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for dev server to start..."
for i in {1..20}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✓ Dev server is ready"
        break
    fi
    sleep 1
done

# Start tap-broadcaster
echo "📡 Starting tap-broadcaster service..."
cd ..
sudo systemctl start tap-broadcaster
sleep 2

# Check status
echo ""
echo "✅ Development environment ready!"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Dev server:  http://localhost:3000 (PID: $DEV_PID)"
echo "   Broadcaster: $(sudo systemctl is-active tap-broadcaster)"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 View logs:"
echo "   Web server:  tail -f web-next output (in terminal)"
echo "   Broadcaster: sudo journalctl -u tap-broadcaster -f"
echo ""
echo "🛑 To stop everything:"
echo "   kill $DEV_PID && sudo systemctl stop tap-broadcaster"
echo ""
echo "Press Ctrl+C to stop (will leave services running)"
echo ""

# Keep script running to show it's active
tail -f /dev/null

