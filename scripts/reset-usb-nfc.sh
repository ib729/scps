#!/bin/bash
# Auto-reset CH340G USB-UART converter without reboot
# Used to recover from serial port locking issues
#
# Usage:
#   ./reset-usb-nfc.sh         # Reset all CH340 devices
#   ./reset-usb-nfc.sh USB0    # Reset only /dev/ttyUSB0
#   ./reset-usb-nfc.sh USB1    # Reset only /dev/ttyUSB1

set -e

# Optional argument: specific device (USB0 or USB1)
SPECIFIC_DEVICE="$1"

echo "[USB RESET] Detecting CH340G device(s)..."

# Function to reset a single device
reset_device() {
    local USB_INFO="$1"
    local DEVICE_NAME="$2"
    
    if [ -z "$USB_INFO" ]; then
        echo "[WARNING] No device info provided for $DEVICE_NAME"
        return 1
    fi
    
    echo "[USB RESET] Found: $USB_INFO"
    
    # Extract bus and device numbers
    local BUS=$(echo "$USB_INFO" | awk '{print $2}')
    local DEV=$(echo "$USB_INFO" | awk '{print $4}' | tr -d ':')
    
    echo "[USB RESET] Resetting Bus $BUS Device $DEV (for $DEVICE_NAME)..."
    
    # Unbind and rebind USB device
    local USB_PATH="/sys/bus/usb/devices/$BUS-$DEV"
    if [ -d "$USB_PATH" ]; then
        echo "$BUS-$DEV" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null 2>&1 || true
        sleep 2
        echo "$BUS-$DEV" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null 2>&1 || true
        sleep 1
        echo "[USB RESET] ✓ Device reset complete"
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
}

# Wait for a specific ttyUSB device to appear
wait_for_device() {
    local DEVICE_PATH="$1"
    local DEVICE_NAME=$(basename "$DEVICE_PATH")
    
    echo "[USB RESET] Waiting for $DEVICE_PATH..."
    for i in {1..10}; do
        if [ -e "$DEVICE_PATH" ]; then
            echo "[USB RESET] ✓ $DEVICE_NAME is ready"
            return 0
        fi
        sleep 0.5
    done
    
    echo "[WARNING] $DEVICE_NAME not detected after reset, but continuing..."
    return 1
}

# Find all CH340 USB devices
mapfile -t USB_DEVICES < <(lsusb | grep -i "CH340\|QinHeng")

if [ ${#USB_DEVICES[@]} -eq 0 ]; then
    echo "[WARNING] No CH340G devices found, trying generic USB serial..."
    mapfile -t USB_DEVICES < <(lsusb | grep -i "serial\|UART")
    if [ ${#USB_DEVICES[@]} -eq 0 ]; then
        echo "[ERROR] No USB serial devices found"
        exit 1
    fi
fi

echo "[USB RESET] Found ${#USB_DEVICES[@]} CH340 device(s)"

# If specific device requested, reset only that one
if [ -n "$SPECIFIC_DEVICE" ]; then
    case "$SPECIFIC_DEVICE" in
        USB0|ttyUSB0|0)
            echo "[USB RESET] Resetting specific device: ttyUSB0"
            if [ ${#USB_DEVICES[@]} -ge 1 ]; then
                reset_device "${USB_DEVICES[0]}" "ttyUSB0"
                wait_for_device "/dev/ttyUSB0"
            else
                echo "[ERROR] USB0 device not found"
                exit 1
            fi
            ;;
        USB1|ttyUSB1|1)
            echo "[USB RESET] Resetting specific device: ttyUSB1"
            if [ ${#USB_DEVICES[@]} -ge 2 ]; then
                reset_device "${USB_DEVICES[1]}" "ttyUSB1"
                wait_for_device "/dev/ttyUSB1"
            else
                echo "[ERROR] USB1 device not found"
                exit 1
            fi
            ;;
        *)
            echo "[ERROR] Unknown device: $SPECIFIC_DEVICE"
            echo "Usage: $0 [USB0|USB1]"
            exit 1
            ;;
    esac
else
    # Reset all devices
    echo "[USB RESET] Resetting all CH340 devices..."
    
    for i in "${!USB_DEVICES[@]}"; do
        reset_device "${USB_DEVICES[$i]}" "ttyUSB$i"
    done
    
    # Wait for devices to reappear
    wait_for_device "/dev/ttyUSB0"
    if [ ${#USB_DEVICES[@]} -ge 2 ]; then
        wait_for_device "/dev/ttyUSB1"
    fi
fi

echo "[USB RESET] All operations complete"
exit 0

