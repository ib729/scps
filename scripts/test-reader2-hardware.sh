#!/bin/bash
# Diagnostic script for Reader 2 hardware

echo "═══════════════════════════════════════════════════════════"
echo "  Reader 2 Hardware Diagnostic Script"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Check USB device
echo "[1/5] Checking USB device detection..."
USB_INFO=$(lsusb | grep -i 'CH340\|QinHeng' | tail -1)
if [ -z "$USB_INFO" ]; then
    echo "❌ No CH340 USB device found for Reader 2"
    exit 1
fi
echo "✓ USB device found: $USB_INFO"
echo ""

# Step 2: Check /dev/ttyUSB1 exists
echo "[2/5] Checking /dev/ttyUSB1..."
if [ ! -e "/dev/ttyUSB1" ]; then
    echo "❌ /dev/ttyUSB1 does not exist"
    echo "   Try: sudo systemctl stop tap-broadcaster-reader2.service"
    echo "   Then check again with: ls -la /dev/ttyUSB*"
    exit 1
fi
echo "✓ /dev/ttyUSB1 exists"
ls -la /dev/ttyUSB1
echo ""

# Step 3: Check if device is in use
echo "[3/5] Checking if ttyUSB1 is in use..."
LSOF_OUTPUT=$(sudo lsof 2>/dev/null | grep ttyUSB1)
if [ -n "$LSOF_OUTPUT" ]; then
    echo "⚠️  ttyUSB1 is currently in use:"
    echo "$LSOF_OUTPUT"
    echo "   Stop the service first: sudo systemctl stop tap-broadcaster-reader2.service"
    exit 1
fi
echo "✓ ttyUSB1 is available"
echo ""

# Step 4: Test raw serial communication
echo "[4/5] Testing raw serial port access..."
if command -v stty &> /dev/null; then
    sudo stty -F /dev/ttyUSB1 115200 2>&1 | head -3
    if [ $? -eq 0 ]; then
        echo "✓ Serial port responds to configuration"
    else
        echo "❌ Serial port does not respond"
    fi
else
    echo "⚠️  'stty' command not found, skipping serial test"
fi
echo ""

# Step 5: Test NFC reader with nfcpy
echo "[5/5] Testing PN532 communication..."
echo "This will timeout after 10 seconds if PN532 doesn't respond."
echo ""

sudo systemctl stop tap-broadcaster-reader2.service 2>/dev/null
sleep 2

cd /home/qiss/stuco
source .venv/bin/activate

timeout 10 python3 << 'PYEOF'
import sys
try:
    import nfc
    print("[TEST] Opening tty:USB1:pn532...")
    with nfc.ContactlessFrontend('tty:USB1:pn532') as clf:
        print("✓ PN532 on ttyUSB1 opened successfully!")
        print(f"  Device: {clf.device}")
        print("\n✓ Reader 2 hardware is WORKING")
        print("\nNext steps:")
        print(" 1. Restart service: sudo systemctl start tap-broadcaster-reader2.service")
        print(" 2. Tap a card on Reader 2 to test")
        sys.exit(0)
except nfc.llcp.llc.Error as e:
    print(f"❌ NFC Error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ ERROR: {e}")
    print("\n=== DIAGNOSIS ===")
    if 'timeout' in str(e).lower() or '110' in str(e):
        print("\n❌ Reader 2 PN532 is NOT responding (timeout)")
        print("\nPossible causes:")
        print(" 1. PN532 DIP switches in wrong mode (should be UART: SW1=OFF, SW2=ON)")
        print(" 2. TX/RX wires reversed between CH340 and PN532")
        print(" 3. Loose wiring/poor connection")
        print(" 4. Faulty PN532 chip")
        print(" 5. Insufficient power to PN532")
        print("\nTroubleshooting steps:")
        print(" 1. Check PN532 DIP switch settings")
        print(" 2. Swap TX and RX wires")
        print(" 3. Check all wire connections")
        print(" 4. Try swapping Reader 1 and Reader 2 to isolate the problem")
        print(" 5. Test with a different PN532 module")
    sys.exit(1)
PYEOF

TEST_EXIT=$?

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $TEST_EXIT -eq 0 ]; then
    echo "  ✓ DIAGNOSTIC COMPLETE - Reader 2 is WORKING"
else
    echo "  ❌ DIAGNOSTIC COMPLETE - Reader 2 has HARDWARE ISSUES"
fi
echo "═══════════════════════════════════════════════════════════"

exit $TEST_EXIT
