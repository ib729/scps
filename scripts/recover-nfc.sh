#!/bin/bash
# Emergency NFC recovery script
# Stops broadcaster, kills processes, resets USB, restarts service

echo "🚨 NFC Emergency Recovery"
echo "========================"
echo ""

echo "1. Stopping tap-broadcaster service..."
sudo systemctl stop tap-broadcaster

echo "2. Killing any stale broadcaster processes holding the port..."
sudo pkill -f "[h]ardware/tap-broadcaster.ts" 2>/dev/null || true
sleep 1

echo "3. Resetting USB device..."
# Detect script directory dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/reset-usb-nfc.sh"

echo "4. Waiting 3 seconds for device to stabilize..."
sleep 3

echo "5. Starting tap-broadcaster service..."
sudo systemctl start tap-broadcaster

echo ""
echo "✅ Recovery complete!"
echo ""
echo "Check status: sudo systemctl status tap-broadcaster"
echo "Check logs: sudo journalctl -u tap-broadcaster -f"
echo ""


