#!/usr/bin/env python3
"""
NFC Reader Hardware Diagnostic Tool

Tests NFC readers systematically to identify hardware issues:
- USB port issues
- CH340G adapter issues
- PN532 reader issues
"""

import sys
import time
import subprocess
from typing import Optional, Tuple

def run_command(cmd: str) -> Tuple[int, str]:
    """Run shell command and return exit code and output"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode, result.stdout + result.stderr
    except Exception as e:
        return -1, str(e)

def list_usb_devices():
    """List all USB devices"""
    print("\n=== USB Devices ===")
    code, output = run_command("lsusb")
    print(output)

    # Count CH340 devices
    ch340_count = output.count("CH340")
    print(f"\nFound {ch340_count} CH340 adapter(s)")
    return ch340_count

def list_serial_ports():
    """List all serial ports"""
    print("\n=== Serial Ports ===")

    # Check for ttyUSB devices
    code, output = run_command("ls -la /dev/ttyUSB* 2>/dev/null")
    if code == 0:
        print("ttyUSB devices:")
        print(output)
    else:
        print("No /dev/ttyUSB* devices found")

    # Check for ttyACM devices
    code, output = run_command("ls -la /dev/ttyACM* 2>/dev/null")
    if code == 0:
        print("\nttyACM devices:")
        print(output)
    else:
        print("No /dev/ttyACM* devices found")

    # Check for ttyAMA (Raspberry Pi UART)
    code, output = run_command("ls -la /dev/ttyAMA* 2>/dev/null")
    if code == 0:
        print("\nttyAMA devices:")
        print(output)

def check_kernel_modules():
    """Check if required kernel modules are loaded"""
    print("\n=== Kernel Modules ===")

    modules = ["ch341", "usbserial", "ftdi_sio"]
    for module in modules:
        code, output = run_command(f"lsmod | grep {module}")
        if code == 0 and output.strip():
            print(f"✓ {module}: loaded")
        else:
            print(f"✗ {module}: not loaded")

def check_dmesg_usb():
    """Check recent kernel messages for USB events"""
    print("\n=== Recent USB Events (last 30 lines) ===")
    code, output = run_command("dmesg | grep -iE 'usb|tty|ch340|ch341' | tail -30")
    if output.strip():
        print(output)
    else:
        print("No recent USB events found")

def test_nfc_reader(port: str) -> bool:
    """Test NFC reader on specified port"""
    print(f"\n=== Testing NFC Reader on {port} ===")

    # Try to import nfcpy
    try:
        import nfc
    except ImportError:
        print("✗ nfcpy not installed. Install with: pip3 install nfcpy")
        return False

    # Try to connect
    try:
        print(f"Attempting to connect to {port}...")
        clf = nfc.ContactlessFrontend(port)
        print(f"✓ Successfully connected to NFC reader!")
        print(f"  Device: {clf.device}")
        clf.close()
        return True
    except Exception as e:
        print(f"✗ Failed to connect: {e}")
        return False

def interactive_test():
    """Interactive testing mode"""
    print("\n" + "="*60)
    print("NFC Reader Hardware Diagnostic Tool")
    print("="*60)

    # Step 1: Check USB devices
    ch340_count = list_usb_devices()

    # Step 2: Check serial ports
    list_serial_ports()

    # Step 3: Check kernel modules
    check_kernel_modules()

    # Step 4: Check dmesg
    check_dmesg_usb()

    # Step 5: Test specific reader
    print("\n" + "="*60)
    print("\nWould you like to test a specific NFC reader? (y/n): ", end="")
    response = input().strip().lower()

    if response == 'y':
        print("\nEnter the port (e.g., tty:USB0:pn532, tty:AMA0:pn532): ", end="")
        port = input().strip()
        test_nfc_reader(port)

    # Recommendations
    print("\n" + "="*60)
    print("DIAGNOSTIC SUMMARY & RECOMMENDATIONS")
    print("="*60)

    if ch340_count == 0:
        print("\n⚠ No CH340 adapters detected")
        print("  → Check USB cable connection")
        print("  → Try a different USB port")
        print("  → Check if USB hub has power")
    elif ch340_count > 0:
        print(f"\n✓ {ch340_count} CH340 adapter(s) detected in lsusb")

        # Check if serial ports exist
        code, _ = run_command("ls /dev/ttyUSB* 2>/dev/null")
        if code != 0:
            print("\n⚠ CH340 detected but no /dev/ttyUSB* ports")
            print("  → Driver may not be loaded")
            print("  → Try: sudo modprobe ch341")
            print("  → Check dmesg for errors")
            print("  → CH340 adapter may be faulty")

    print("\n" + "="*60)
    print("\nTROUBLESHOOTING STEPS:")
    print("="*60)
    print("\n1. Test different USB ports:")
    print("   - Disconnect the reader")
    print("   - Plug into a different USB port")
    print("   - Run: lsusb (should see CH340)")
    print("   - Run: ls /dev/ttyUSB* (should see ttyUSB0 or similar)")

    print("\n2. Test with another CH340G adapter:")
    print("   - Keep the PN532 reader")
    print("   - Swap to a different CH340G adapter")
    print("   - If it works → bad CH340G adapter")
    print("   - If it fails → likely PN532 reader issue")

    print("\n3. Test another PN532 reader:")
    print("   - Keep the same CH340G adapter")
    print("   - Connect a different PN532 reader")
    print("   - If it works → bad PN532 reader")
    print("   - If it fails → likely CH340G adapter issue")

    print("\n4. Check wiring (if using UART mode):")
    print("   - VCC → 3.3V or 5V (check PN532 jumper settings)")
    print("   - GND → GND")
    print("   - TXD → RXD (cross connection)")
    print("   - RXD → TXD (cross connection)")

    print("\n5. Power cycle:")
    print("   - Unplug USB")
    print("   - Wait 10 seconds")
    print("   - Plug back in")
    print("   - Check dmesg for new device messages")

    print("\n" + "="*60)

if __name__ == "__main__":
    try:
        interactive_test()
    except KeyboardInterrupt:
        print("\n\nDiagnostic interrupted.")
        sys.exit(0)
