#!/usr/bin/env python3
"""
NFC Reader Hardware Test Script

Tests both USB0 and USB1 to identify which physical readers are working.
"""

import sys
import time

try:
    import nfc
except ImportError:
    print("Error: nfcpy not installed. Run: pip install nfcpy")
    sys.exit(1)

def test_reader(device_name, device_path):
    """Test a single NFC reader"""
    print(f"\n{'='*60}")
    print(f"Testing {device_name} ({device_path})")
    print(f"{'='*60}")
    
    try:
        print(f"[1/3] Attempting to open device...")
        clf = nfc.ContactlessFrontend(device_path)
        print(f"✓ Device opened successfully!")
        
        print(f"[2/3] Device info: {clf}")
        
        print(f"[3/3] Testing card detection (tap a card within 5 seconds)...")
        
        def on_connect(tag):
            uid = tag.identifier.hex().upper()
            print(f"✓ Card detected! UID: {uid}")
            return False  # Release immediately
        
        clf.connect(rdwr={'on-connect': on_connect}, terminate=lambda: False)
        
        clf.close()
        print(f"✓ {device_name} is WORKING")
        return True
        
    except IOError as e:
        if "timeout" in str(e).lower():
            print(f"✗ {device_name} FAILED: Connection timeout")
            print(f"   This usually means:")
            print(f"   - The device is not a PN532 reader")
            print(f"   - The reader hardware is faulty")
            print(f"   - Wrong device type specified")
        else:
            print(f"✗ {device_name} FAILED: {e}")
        return False
    except Exception as e:
        print(f"✗ {device_name} FAILED: {e}")
        return False

def main():
    print("NFC Reader Hardware Test")
    print("="*60)
    print("This script will test both USB readers to identify which")
    print("physical readers are working.")
    print()
    print("Make sure:")
    print("1. Both readers are plugged in")
    print("2. No broadcaster services are running")
    print("3. You have a card ready to tap")
    print()
    input("Press Enter to start testing...")
    
    results = {}
    
    # Test USB0
    results['USB0'] = test_reader("Reader USB0", "tty:USB0:pn532")
    time.sleep(1)
    
    # Test USB1
    results['USB1'] = test_reader("Reader USB1", "tty:USB1:pn532")
    
    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")
    print(f"USB0 (ttyUSB0): {'✓ WORKING' if results['USB0'] else '✗ NOT WORKING'}")
    print(f"USB1 (ttyUSB1): {'✓ WORKING' if results['USB1'] else '✗ NOT WORKING'}")
    print()
    
    if results['USB0'] and results['USB1']:
        print("✓ Both readers are working!")
        print("  You can use dual-reader mode.")
    elif results['USB1'] and not results['USB0']:
        print("⚠ Only USB1 is working.")
        print("  Recommendation:")
        print("  1. Check if USB0 reader is plugged in correctly")
        print("  2. Try swapping the USB ports")
        print("  3. Replace the USB0 reader if faulty")
    elif results['USB0'] and not results['USB1']:
        print("⚠ Only USB0 is working.")
        print("  You may need to swap the service configurations.")
    else:
        print("✗ Neither reader is working!")
        print("  Check your hardware connections.")

if __name__ == "__main__":
    main()

