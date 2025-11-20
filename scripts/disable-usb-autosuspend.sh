#!/bin/bash
# Disable USB Autosuspend to Prevent NFC Readers from Going to Sleep
# This script adds usbcore.autosuspend=-1 to the kernel boot parameters

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         Disable USB Autosuspend for NFC Readers             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run with sudo"
    echo "Usage: sudo ./scripts/disable-usb-autosuspend.sh"
    exit 1
fi

CMDLINE_FILE="/boot/firmware/cmdline.txt"

# Backup the original file
echo "[1/4] Creating backup of $CMDLINE_FILE..."
cp "$CMDLINE_FILE" "${CMDLINE_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
echo "      Backup created: ${CMDLINE_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
echo ""

# Check if parameter is already present
if grep -q "usbcore.autosuspend=-1" "$CMDLINE_FILE"; then
    echo "[2/4] USB autosuspend parameter already present in $CMDLINE_FILE"
    echo "      No changes needed."
    echo ""
    
    # Check if it's active
    CURRENT_VALUE=$(cat /sys/module/usbcore/parameters/autosuspend)
    if [ "$CURRENT_VALUE" == "-1" ]; then
        echo "✓ USB autosuspend is already disabled (value: -1)"
        echo "  No reboot required."
    else
        echo "⚠ USB autosuspend is still enabled (value: $CURRENT_VALUE)"
        echo "  A reboot is required to apply the changes."
        echo ""
        read -p "Reboot now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Rebooting in 5 seconds... (Ctrl+C to cancel)"
            sleep 5
            reboot
        fi
    fi
    exit 0
fi

# Add the parameter to the end of the line
echo "[2/4] Adding usbcore.autosuspend=-1 to $CMDLINE_FILE..."
sed -i 's/$/ usbcore.autosuspend=-1/' "$CMDLINE_FILE"
echo "      Parameter added successfully."
echo ""

# Verify the change
echo "[3/4] Verifying changes..."
if grep -q "usbcore.autosuspend=-1" "$CMDLINE_FILE"; then
    echo "      ✓ Verification successful"
    echo ""
    echo "Updated content:"
    cat "$CMDLINE_FILE"
    echo ""
else
    echo "      ✗ Verification FAILED"
    echo "      Restoring backup..."
    cp "${CMDLINE_FILE}.backup-"* "$CMDLINE_FILE"
    echo "      Backup restored. Please check manually."
    exit 1
fi

# Reboot prompt
echo "[4/4] Reboot required"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "The USB autosuspend parameter has been added to the kernel"
echo "boot parameters, but a REBOOT is required for it to take effect."
echo ""
echo "After reboot, verify with:"
echo "  cat /sys/module/usbcore/parameters/autosuspend"
echo "  (should show: -1)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

read -p "Reboot now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Rebooting in 5 seconds... (Ctrl+C to cancel)"
    sleep 5
    reboot
else
    echo ""
    echo "Reboot skipped. Run 'sudo reboot' when ready."
    echo ""
fi

