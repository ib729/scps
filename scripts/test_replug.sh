#!/bin/bash
# Test if unplugging and replugging creates /dev/ttyUSB*

echo "=========================================================="
echo "NFC Reader Unplug/Replug Test"
echo "=========================================================="
echo ""
echo "This script will help you test if the port is working."
echo ""
read -p "Press ENTER when reader is plugged in and you're ready..."

echo ""
echo "📍 Initial State:"
echo "----------------------------------------------------------"
echo "USB devices:"
lsusb | grep CH340 || echo "  ❌ No CH340 found"
echo ""
echo "Serial ports:"
ls -la /dev/ttyUSB* 2>/dev/null || echo "  ❌ No /dev/ttyUSB* found"

echo ""
echo "----------------------------------------------------------"
echo "🔌 Now UNPLUG the reader from the USB port"
read -p "Press ENTER after you've unplugged it..."

echo ""
echo "📍 After unplug:"
echo "----------------------------------------------------------"
SLEEP 1
lsusb | grep CH340 && echo "  ⚠️  CH340 still detected (may be cached)" || echo "  ✅ CH340 removed"

echo ""
echo "----------------------------------------------------------"
echo "🔌 Now PLUG the reader back into the SAME port"
read -p "Press ENTER after you've plugged it in..."

echo ""
echo "⏳ Waiting 3 seconds for device to settle..."
sleep 3

echo ""
echo "📍 After replug:"
echo "----------------------------------------------------------"
echo "USB devices:"
if lsusb | grep -q CH340; then
    echo "  ✅ CH340 detected"
    lsusb | grep CH340
else
    echo "  ❌ CH340 NOT detected"
fi

echo ""
echo "USB topology:"
lsusb -t | grep -B 1 ch341 || echo "  ❌ Not in device tree"

echo ""
echo "Serial ports:"
if ls /dev/ttyUSB* 2>/dev/null; then
    echo "  ✅ Serial port created!"
    ls -la /dev/ttyUSB*
    echo ""
    echo "  Testing NFC connection..."
    python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print('  ✅ NFC reader connected:', clf.device); clf.close()" 2>&1 && SUCCESS=1 || SUCCESS=0

    if [ $SUCCESS -eq 1 ]; then
        echo ""
        echo "  🎉 Port is FULLY WORKING!"
    else
        echo ""
        echo "  ⚠️  Serial port exists but NFC connection failed"
    fi
else
    echo "  ❌ No /dev/ttyUSB* created"
    echo ""
    echo "  Checking kernel messages for errors..."
    dmesg | tail -20 | grep -iE 'usb|ch340|ch341|error'
fi

echo ""
echo "=========================================================="
echo "TEST COMPLETE"
echo "=========================================================="
echo ""

if ls /dev/ttyUSB* 2>/dev/null > /dev/null; then
    echo "✅ This port appears to be WORKING"
    echo "   - CH340 detected"
    echo "   - Serial port created"
    echo "   - Ready for NFC operations"
else
    echo "❌ This port has ISSUES"
    echo "   Possible causes:"
    echo "   - Port is physically damaged"
    echo "   - Insufficient power delivery  "
    echo "   - USB hub compatibility issue"
    echo ""
    echo "   💡 Try testing a different port:"
    echo "      1. Unplug the reader"
    echo "      2. Plug into a DIFFERENT USB port"
    echo "      3. Run this script again"
fi

echo ""
