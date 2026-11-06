#!/usr/bin/env python3
"""
USB Port Tester for NFC Readers
Tests which USB ports work reliably with CH340/PN532 readers
"""

import subprocess
import time
import sys

def get_usb_devices():
    """Get list of connected CH340 devices"""
    result = subprocess.run(
        "lsusb | grep CH340",
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def get_usb_topology():
    """Get USB device tree"""
    result = subprocess.run(
        "lsusb -t | grep -A 2 ch341",
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def get_serial_ports():
    """Get list of ttyUSB devices"""
    result = subprocess.run(
        "ls -la /dev/ttyUSB* 2>/dev/null",
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def test_nfc_connection(port="tty:USB0:pn532"):
    """Test if NFC reader is accessible"""
    try:
        import nfc
        clf = nfc.ContactlessFrontend(port)
        device_info = str(clf.device)
        clf.close()
        return True, device_info
    except Exception as e:
        return False, str(e)

def check_kernel_messages():
    """Check recent kernel messages for USB errors"""
    result = subprocess.run(
        "dmesg | tail -20 | grep -iE 'usb|ch340|ch341'",
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def main():
    print("="*70)
    print("USB Port Test for NFC Reader")
    print("="*70)

    print("\n📋 Instructions:")
    print("1. Start with reader plugged into current (working) port")
    print("2. Press ENTER to test current state")
    print("3. Unplug reader when prompted")
    print("4. Plug into new port when prompted")
    print("5. Press ENTER to test new port")
    print("6. Repeat for each port you want to test")
    print("\n" + "="*70)

    test_number = 1
    results = []

    while True:
        print(f"\n🔍 TEST #{test_number}")
        print("-" * 70)

        port_label = input("\nWhich port is the reader in? (e.g., 'bottom USB 2.0', 'top USB 3.0'): ").strip()
        if not port_label:
            print("\n✅ Testing complete!")
            break

        input("\n➡️  Press ENTER when ready to test...")

        print("\n🔍 Checking USB detection...")
        usb_devices = get_usb_devices()
        if usb_devices:
            print(f"  ✓ CH340 detected: {usb_devices}")
        else:
            print("  ✗ CH340 NOT detected in lsusb")

        print("\n🔍 Checking USB topology...")
        topology = get_usb_topology()
        if topology:
            print(f"  {topology}")
        else:
            print("  ✗ Not in USB device tree")

        print("\n🔍 Checking serial ports...")
        serial_ports = get_serial_ports()
        if serial_ports:
            print(f"  ✓ Serial ports found:\n{serial_ports}")

            # Try to test connection
            print("\n🔍 Testing NFC connection...")
            success, info = test_nfc_connection()
            if success:
                print(f"  ✓ NFC reader connected successfully!")
                print(f"  Device: {info}")
            else:
                print(f"  ✗ Failed to connect: {info}")
        else:
            print("  ✗ No /dev/ttyUSB* devices found")
            success = False

        print("\n🔍 Checking kernel messages...")
        kernel_msg = check_kernel_messages()
        if kernel_msg:
            print(f"  Recent USB messages:\n{kernel_msg}")

        # Record result
        result = {
            'port': port_label,
            'usb_detected': bool(usb_devices),
            'serial_port': bool(serial_ports),
            'nfc_working': success,
            'test_number': test_number
        }
        results.append(result)

        print("\n" + "="*70)
        print("RESULT SUMMARY")
        print("="*70)
        if result['usb_detected'] and result['serial_port'] and result['nfc_working']:
            print(f"✅ Port '{port_label}' is WORKING")
        else:
            print(f"❌ Port '{port_label}' has ISSUES:")
            if not result['usb_detected']:
                print("   - CH340 not detected in lsusb (hardware detection failure)")
            if not result['serial_port']:
                print("   - No serial port created (driver/power issue)")
            if not result['nfc_working']:
                print("   - NFC reader cannot connect (communication failure)")

        print("\n" + "="*70)
        choice = input("\nTest another port? (y/n): ").strip().lower()
        if choice != 'y':
            break

        print("\n📤 Please UNPLUG the reader and move it to a different port")
        input("➡️  Press ENTER when you've moved the reader...")

        # Wait for device to settle
        time.sleep(2)
        test_number += 1

    # Final summary
    print("\n" + "="*70)
    print("FINAL RESULTS SUMMARY")
    print("="*70)

    working_ports = []
    broken_ports = []

    for r in results:
        if r['usb_detected'] and r['serial_port'] and r['nfc_working']:
            working_ports.append(r['port'])
            print(f"✅ {r['port']}: WORKING")
        else:
            broken_ports.append(r['port'])
            status = []
            if not r['usb_detected']:
                status.append("no USB detection")
            if not r['serial_port']:
                status.append("no serial port")
            if not r['nfc_working']:
                status.append("NFC fails")
            print(f"❌ {r['port']}: BROKEN ({', '.join(status)})")

    print("\n" + "="*70)
    print("RECOMMENDATIONS")
    print("="*70)

    if len(working_ports) >= 2:
        print(f"\n✅ You have {len(working_ports)} working ports!")
        print("   For dual-reader setup:")
        print(f"   - Reader 1: {working_ports[0]}")
        print(f"   - Reader 2: {working_ports[1]}")
    elif len(working_ports) == 1:
        print(f"\n⚠️  Only 1 working port: {working_ports[0]}")
        print("   For dual-reader setup, you'll need a powered USB hub:")
        print(f"   - Connect hub to: {working_ports[0]}")
        print("   - Connect both readers to the hub")
    else:
        print("\n❌ No working ports found!")
        print("   Possible issues:")
        print("   - Power supply insufficient")
        print("   - All USB ports damaged")
        print("   - Driver issues")

    if broken_ports:
        print(f"\n⚠️  Broken ports: {', '.join(broken_ports)}")
        print("   These ports should be avoided for NFC readers.")

    print("\n" + "="*70)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest interrupted.")
        sys.exit(0)
