#!/bin/bash
# Auto-reset CH340G USB-UART converter without reboot
# Used to recover from serial port locking issues

set -e

echo "[USB RESET] Detecting CH340G device..."

# Find CH340 USB device
USB_INFO=$(lsusb | grep -i "CH340\|QinHeng" | head -n1)
if [ -z "$USB_INFO" ]; then
    echo "[WARNING] CH340G device not found, trying generic USB serial..."
    # Try to find any USB serial device
    USB_INFO=$(lsusb | grep -i "serial\|UART" | head -n1)
    if [ -z "$USB_INFO" ]; then
        echo "[ERROR] No USB serial device found"
        exit 1
    fi
fi

echo "[USB RESET] Found: $USB_INFO"

# Extract bus and device numbers
BUS=$(echo "$USB_INFO" | awk '{print $2}')
DEV=$(echo "$USB_INFO" | awk '{print $4}' | tr -d ':')

echo "[USB RESET] Bus $BUS Device $DEV"

# Unbind and rebind USB device
USB_PATH="/sys/bus/usb/devices/$BUS-$DEV"
if [ -d "$USB_PATH" ]; then
    echo "[USB RESET] Resetting device..."
    echo "$BUS-$DEV" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null 2>&1 || true
    sleep 2
    echo "$BUS-$DEV" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null 2>&1 || true
    sleep 1
    echo "[USB RESET] Device reset complete"
else
    echo "[WARNING] USB path not found at $USB_PATH"
    # Alternative: try usbreset tool if available
    if command -v usbreset &> /dev/null; then
        echo "[USB RESET] Using usbreset tool..."
        sudo usbreset "$(echo $USB_INFO | awk '{print $6}')"
    else
        echo "[WARNING] Could not reset device automatically"
    fi
fi

# Wait for ttyUSB device to reappear
echo "[USB RESET] Waiting for /dev/ttyUSB0..."
for i in {1..10}; do
    if [ -e /dev/ttyUSB0 ]; then
        echo "[USB RESET] ✓ /dev/ttyUSB0 is ready"
        exit 0
    fi
    sleep 0.5
done

echo "[WARNING] /dev/ttyUSB0 not detected after reset, but continuing..."
exit 0

