#!/bin/bash
# Quick USB port check for NFC reader
# Run this before and after moving the reader to a new port

echo "======================================"
echo "USB Port Quick Check"
echo "======================================"

echo -e "\n1️⃣  USB Device Detection (lsusb):"
if lsusb | grep -q "CH340"; then
    echo "   ✅ CH340 detected"
    lsusb | grep CH340
else
    echo "   ❌ CH340 NOT detected"
fi

echo -e "\n2️⃣  USB Bus/Port Location:"
lsusb -t | grep -B 1 -A 1 ch341 || echo "   ❌ Not in device tree"

echo -e "\n3️⃣  Serial Port Created:"
if ls /dev/ttyUSB* 2>/dev/null; then
    echo "   ✅ Serial port(s) available"
    ls -la /dev/ttyUSB*
else
    echo "   ❌ No /dev/ttyUSB* devices"
fi

echo -e "\n4️⃣  Recent Kernel Messages:"
dmesg | tail -10 | grep -iE 'usb|ch340|ch341' || echo "   No recent USB messages"

echo -e "\n======================================"
echo "Quick Diagnosis:"
echo "======================================"

HAS_USB=$(lsusb | grep -c "CH340")
HAS_TTY=$(ls /dev/ttyUSB* 2>/dev/null | wc -l)

if [ "$HAS_USB" -gt 0 ] && [ "$HAS_TTY" -gt 0 ]; then
    echo "✅ Port appears to be WORKING"
    echo "   - CH340 detected in lsusb"
    echo "   - Serial port exists"
    echo "   - Try: python3 -c 'import nfc; clf = nfc.ContactlessFrontend(\"tty:USB0:pn532\"); print(clf.device); clf.close()'"
elif [ "$HAS_USB" -gt 0 ]; then
    echo "⚠️  Port has ISSUES"
    echo "   - CH340 detected BUT no serial port"
    echo "   - Possible causes: driver issue, power problem, bad adapter"
else
    echo "❌ Port is NOT WORKING"
    echo "   - CH340 not detected at all"
    echo "   - Possible causes: bad port, no power, loose connection"
fi

echo ""
