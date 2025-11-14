# USB Port Testing Guide for Dual NFC Reader Setup

## Your Raspberry Pi 4 USB Port Layout

```
┌─────────────────────────────────────────┐
│     Raspberry Pi 4 Model B USB Ports    │
│                                         │
│  🔵 USB 3.0  🔵 USB 3.0  (Bus 002)      │  ← Blue ports (faster)
│  ⚫ USB 2.0  ⚫ USB 2.0  (Bus 001)      │  ← Black ports
│                                         │
└─────────────────────────────────────────┘
    Top          Bottom
```

**Current Status:**
- ✅ **Bottom USB 2.0**: WORKING (confirmed)
- ❓ **Top USB 2.0**: Suspected faulty
- ❓ **USB 3.0 ports** (blue): Need testing

## Quick Test Method

### Option 1: Use Automated Script

```bash
python3 test_usb_ports.py
```

This interactive script will guide you through testing each port.

### Option 2: Quick Manual Check

**Before moving the reader:**
```bash
./scripts/check_usb_port.sh
```

**Then physically move the reader to a different port and run again:**
```bash
./scripts/check_usb_port.sh
```

### Option 3: Manual Step-by-Step

#### Step 1: Test Current Port (Baseline)
```bash
# Should all show positive results
lsusb | grep CH340                 # Should show CH340 device
ls -la /dev/ttyUSB*               # Should show /dev/ttyUSB0
lsusb -t | grep ch341             # Should show bus/port location
```

#### Step 2: Test Top USB 2.0 Port
```bash
# Unplug reader from bottom port
# Plug into TOP black USB 2.0 port
# Wait 2 seconds

lsusb | grep CH340                 # Does it appear?
ls -la /dev/ttyUSB*               # Does serial port exist?
dmesg | tail -20                  # Any errors?
```

#### Step 3: Test USB 3.0 Ports (Blue)
```bash
# Unplug reader
# Plug into BLUE USB 3.0 port
# Wait 2 seconds

lsusb | grep CH340                 # Does it appear?
ls -la /dev/ttyUSB*               # Does serial port exist?
lsusb -t | grep ch341             # Should show "Bus 002" for USB 3.0
```

## Understanding Results

### ✅ Port is WORKING if:
- `lsusb` shows CH340 device
- `/dev/ttyUSB*` exists
- No errors in `dmesg`
- NFC reader can connect: `python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print('OK:', clf.device); clf.close()"`

### ❌ Port is BROKEN if:
- `lsusb` doesn't show CH340 → **Port has no USB detection**
- `lsusb` shows CH340 BUT no `/dev/ttyUSB*` → **Driver/power issue**
- `/dev/ttyUSB*` exists BUT nfcpy fails → **Communication issue**

### Common Error Messages:

| Error in dmesg | Meaning | Port Status |
|----------------|---------|-------------|
| `device not accepting address` | Power or signal issue | Likely broken |
| `device descriptor read error` | Bad USB connection | Likely broken |
| `unable to enumerate` | Driver/compatibility | May work with fix |
| `ch341-uart converter detected` | Normal detection | Good sign |

## Testing for USB 3.0 Compatibility

**CH340 is a USB 2.0 device**, but it should work in USB 3.0 ports (backward compatible).

When plugged into USB 3.0 port:
- Will still operate at USB 2.0 speeds (12Mbps)
- Should appear in `lsusb -t` on Bus 002
- Blue LED on the port may not light up (normal)

**To test:**
```bash
# Plug into blue USB 3.0 port
lsusb -t | grep ch341

# Look for:
# Bus 002.Port XXX: Dev XXX, Class=Vendor Specific Class, Driver=ch341, 12M
#     ^^^^ This indicates USB 3.0 bus (Bus 002)
```

## Expected Test Results

### Scenario A: Top USB 2.0 is broken, USB 3.0 works
```
✅ Bottom USB 2.0 (Bus 001): Working
❌ Top USB 2.0 (Bus 001): Broken
✅ USB 3.0 (Bus 002): Working
✅ USB 3.0 (Bus 002): Working

→ Solution: Use bottom USB 2.0 + one USB 3.0 for dual readers
```

### Scenario B: Only bottom USB 2.0 works
```
✅ Bottom USB 2.0 (Bus 001): Working
❌ Top USB 2.0 (Bus 001): Broken
❌ USB 3.0 (Bus 002): Not working
❌ USB 3.0 (Bus 002): Not working

→ Solution: Need powered USB hub on bottom USB 2.0 port
```

### Scenario C: USB 3.0 has issues
```
✅ Bottom USB 2.0 (Bus 001): Working
❌ Top USB 2.0 (Bus 001): Broken
⚠️  USB 3.0 (Bus 002): Detected but no /dev/ttyUSB*

→ Possible cause: USB 3.0 controller power management
→ Try disabling USB autosuspend (see below)
```

## Troubleshooting USB 3.0 Issues

If CH340 appears in `lsusb` but no serial port is created:

### Check USB autosuspend:
```bash
# Check current autosuspend settings
cat /sys/module/usbcore/parameters/autosuspend

# Disable autosuspend for testing
echo -1 | sudo tee /sys/module/usbcore/parameters/autosuspend

# Unplug and replug the reader
```

### Check USB power settings:
```bash
# See power management for USB devices
lsusb -v | grep -E 'idVendor|idProduct|MaxPower'

# Disable USB selective suspend (add to /boot/config.txt)
sudo nano /boot/config.txt
# Add: dtoverlay=dwc2,dr_mode=host
```

## Recommended Setup for Dual Readers

### If you find 2+ working ports:
```bash
# Direct connection to two different ports
Reader 1 → Bottom USB 2.0 → /dev/ttyUSB0
Reader 2 → USB 3.0 (blue) → /dev/ttyUSB1

# Update your configuration
python tap-broadcaster.py --port /dev/ttyUSB0 &
python tap-broadcaster.py --port /dev/ttyUSB1 &
```

### If only 1 port works:
```bash
# Use powered USB hub
Bottom USB 2.0 → Powered USB Hub
                    ├─ Reader 1 → /dev/ttyUSB0
                    └─ Reader 2 → /dev/ttyUSB1
```

## Recording Your Results

As you test, fill in this table:

```
Port Test Results:
┌─────────────────────┬──────────┬────────────┬──────────────┐
│ Port                │ lsusb OK │ /dev/tty*  │ NFC connects │
├─────────────────────┼──────────┼────────────┼──────────────┤
│ Bottom USB 2.0      │    ✅    │     ✅     │      ✅      │
│ Top USB 2.0         │    ?     │     ?      │      ?       │
│ USB 3.0 (left blue) │    ?     │     ?      │      ?       │
│ USB 3.0 (right blue)│    ?     │     ?      │      ?       │
└─────────────────────┴──────────┴────────────┴──────────────┘
```

## Next Steps After Testing

1. **Test each port systematically** using one of the methods above
2. **Document which ports work**
3. **If ≥2 ports work**: Use direct connections for both readers
4. **If only 1 port works**: Order a powered USB hub
5. **If USB 3.0 doesn't work**: Try autosuspend fixes above

## Confirming a Port is Truly Broken

A port is confirmed broken if:
- ✅ Works in bottom USB 2.0 (known good)
- ❌ Doesn't work in suspected port
- ✅ Different device (keyboard, mouse, USB drive) also fails in that port

**Final confirmation test:**
```bash
# Test with a USB flash drive
# Plug USB drive into suspected broken port
lsusb  # Should show the USB drive
ls /dev/sd*  # Should show new device like /dev/sda

# If flash drive also fails → port is definitely broken
# If flash drive works but CH340 doesn't → may be power issue
```
