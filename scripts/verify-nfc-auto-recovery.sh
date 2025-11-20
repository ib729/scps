#!/bin/bash
# Verify NFC Auto-Recovery Configuration
# This script checks that all auto-recovery mechanisms are properly configured.

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║      NFC Auto-Recovery Configuration Verification           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Function to print status
print_status() {
    local status=$1
    local message=$2
    
    if [ "$status" == "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $message"
        ((PASSED++))
    elif [ "$status" == "FAIL" ]; then
        echo -e "${RED}✗ FAIL${NC}: $message"
        ((FAILED++))
    elif [ "$status" == "WARN" ]; then
        echo -e "${YELLOW}⚠ WARN${NC}: $message"
        ((WARNINGS++))
    else
        echo "  INFO: $message"
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "1. Checking USB Autosuspend Configuration"
echo "═══════════════════════════════════════════════════════════════"

# Check cmdline.txt
if grep -q "usbcore.autosuspend=-1" /boot/firmware/cmdline.txt 2>/dev/null; then
    print_status "PASS" "usbcore.autosuspend=-1 found in /boot/firmware/cmdline.txt"
else
    print_status "FAIL" "usbcore.autosuspend=-1 NOT found in /boot/firmware/cmdline.txt"
fi

# Check if it's actually applied (requires reboot after cmdline.txt change)
AUTOSUSPEND_VALUE=$(cat /sys/module/usbcore/parameters/autosuspend 2>/dev/null || echo "ERROR")
if [ "$AUTOSUSPEND_VALUE" == "-1" ]; then
    print_status "PASS" "USB autosuspend is disabled (value: -1)"
elif [ "$AUTOSUSPEND_VALUE" == "ERROR" ]; then
    print_status "FAIL" "Cannot read autosuspend parameter"
else
    print_status "WARN" "USB autosuspend is enabled (value: $AUTOSUSPEND_VALUE) - REBOOT REQUIRED"
    echo "         Run 'sudo reboot' to apply the cmdline.txt changes"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "2. Checking Hardware Reconnection Code"
echo "═══════════════════════════════════════════════════════════════"

# Check if hardware reconnection function exists
if grep -q "nfc_reader_loop_with_reconnection" /home/qiss/scps/tap-broadcaster.py; then
    print_status "PASS" "Hardware reconnection wrapper found in tap-broadcaster.py"
else
    print_status "FAIL" "Hardware reconnection wrapper NOT found in tap-broadcaster.py"
fi

# Check if it's being used
if grep -q "await nfc_reader_loop_with_reconnection" /home/qiss/scps/tap-broadcaster.py; then
    print_status "PASS" "Hardware reconnection is being used in main loop"
else
    print_status "FAIL" "Hardware reconnection is NOT being used in main loop"
fi

# Check for enhanced error handling
if grep -q "fatal_error" /home/qiss/scps/tap-broadcaster.py; then
    print_status "PASS" "Enhanced error detection implemented"
else
    print_status "FAIL" "Enhanced error detection NOT found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "3. Checking Systemd Service Configuration"
echo "═══════════════════════════════════════════════════════════════"

# Check if services exist
for SERVICE in tap-broadcaster.service tap-broadcaster-reader2.service; do
    if systemctl list-unit-files | grep -q "^$SERVICE"; then
        print_status "PASS" "$SERVICE is installed"
        
        # Check if Restart=always is set
        RESTART_POLICY=$(systemctl show $SERVICE -p Restart --value)
        if [ "$RESTART_POLICY" == "always" ]; then
            print_status "PASS" "$SERVICE has Restart=always"
        else
            print_status "WARN" "$SERVICE restart policy is '$RESTART_POLICY' (should be 'always')"
        fi
        
        # Check if service is enabled
        if systemctl is-enabled $SERVICE >/dev/null 2>&1; then
            print_status "PASS" "$SERVICE is enabled (auto-starts on boot)"
        else
            print_status "WARN" "$SERVICE is NOT enabled for auto-start"
        fi
        
        # Check if service is running
        if systemctl is-active $SERVICE >/dev/null 2>&1; then
            print_status "PASS" "$SERVICE is currently running"
        else
            print_status "WARN" "$SERVICE is NOT currently running"
        fi
    else
        print_status "WARN" "$SERVICE not found (might be single-reader setup)"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "4. Checking Hardware Devices"
echo "═══════════════════════════════════════════════════════════════"

# Check for USB devices
USB_DEVICES=$(lsusb | grep -i "CH340\|QinHeng" | wc -l)
if [ "$USB_DEVICES" -gt 0 ]; then
    print_status "PASS" "Found $USB_DEVICES CH340 USB device(s)"
    lsusb | grep -i "CH340\|QinHeng"
else
    print_status "WARN" "No CH340 USB devices detected (readers might use different chips)"
fi

# Check for ttyUSB devices
TTY_DEVICES=$(ls /dev/ttyUSB* 2>/dev/null | wc -l)
if [ "$TTY_DEVICES" -gt 0 ]; then
    print_status "PASS" "Found $TTY_DEVICES ttyUSB device(s)"
    ls -l /dev/ttyUSB* 2>/dev/null
else
    print_status "WARN" "No /dev/ttyUSB* devices found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "5. Summary and Next Steps"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "⚠️  FAILED CHECKS DETECTED"
    echo "   Please review the failed items above and fix them."
    echo ""
fi

if [ "$AUTOSUSPEND_VALUE" != "-1" ] && grep -q "usbcore.autosuspend=-1" /boot/firmware/cmdline.txt 2>/dev/null; then
    echo "🔄 REBOOT REQUIRED"
    echo "   The USB autosuspend parameter has been added to cmdline.txt"
    echo "   but is not yet active. Please reboot the system:"
    echo "   sudo reboot"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
echo "Manual Testing Instructions"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "After fixing any issues and rebooting (if needed), test the"
echo "auto-recovery by following these steps:"
echo ""
echo "1. Monitor the logs in real-time:"
echo "   sudo journalctl -u tap-broadcaster -f"
echo ""
echo "2. In another terminal, test hardware recovery:"
echo "   # Physically unplug the USB NFC reader"
echo "   # Wait 10 seconds"
echo "   # Plug it back in"
echo ""
echo "3. You should see in the logs:"
echo "   [NFC] Hardware connection lost: ..."
echo "   [NFC] Attempting hardware reconnection #1 in 1s..."
echo "   [NFC] Hardware reconnection successful!"
echo ""
echo "4. Test long-term stability:"
echo "   # Leave the system running overnight"
echo "   # Check logs the next day:"
echo "   sudo journalctl -u tap-broadcaster --since yesterday"
echo ""
echo "5. If issues persist, check:"
echo "   ./scripts/fix-readers.sh      # Manual recovery"
echo "   dmesg | grep -i usb            # Hardware errors"
echo ""

if [ $FAILED -eq 0 ] && [ "$AUTOSUSPEND_VALUE" == "-1" ]; then
    echo -e "${GREEN}✓ All checks passed!${NC} Auto-recovery should be working."
    echo "  Test it manually using the instructions above."
fi

echo ""

