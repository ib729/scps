# NFC Reader Hardware Issue - Diagnosis Report

**Date:** November 17, 2025  
**Issue:** Only one NFC reader is working, causing all taps to be tagged as reader-2

## Problem Summary

The dual-reader filtering system is working correctly in software, but **Reader 1 (USB0) hardware is not responding**.

## Hardware Test Results

| Device | Status | Details |
|--------|--------|---------|
| **USB0 (ttyUSB0)** | ❌ **NOT WORKING** | PN532 chip timeout - hardware not responding |
| **USB1 (ttyUSB1)** | ✅ **WORKING** | Fully functional, detecting cards correctly |

## Root Cause

The physical NFC reader connected to USB port 0 (ttyUSB0) is:
- Not responding to PN532 initialization commands
- Timing out on every connection attempt
- Either faulty hardware, wrong device type, or connection issue

## Current Behavior

- **tap-broadcaster.service** (reader-1) → tries to use USB0 → fails with timeout errors
- **tap-broadcaster-reader2.service** (reader-2) → uses USB1 → works perfectly

**Result:** All card taps come from reader-2, regardless of browser selection.

## Evidence from Logs

```
Nov 17 21:22:27 rpi python[105176]: [ERROR] Device tty:USB0:pn532 timeout - reader may be faulty or not responding
Nov 17 21:22:27 rpi python[105176]: [ERROR] Check hardware connection and try: sudo ./scripts/reset-usb-nfc.sh
```

The reader-1 service is running but continuously getting timeout errors when trying to read from USB0.

## Solutions

### Option 1: Fix/Replace USB0 Reader (Recommended)

1. **Check physical connection:**
   ```bash
   # Verify the device exists
   ls -la /dev/ttyUSB0
   
   # Check USB connection
   lsusb | grep CH340
   ```

2. **Test the hardware:**
   ```bash
   cd /home/qiss/stuco
   sudo systemctl stop tap-broadcaster.service tap-broadcaster-reader2.service
   /home/qiss/stuco/.venv/bin/python3 test_readers.py
   ```

3. **Try swapping USB ports:**
   - Unplug both readers
   - Plug the working reader into the USB0 port
   - Plug the non-working reader into USB1 port
   - Run the test script again to see if the problem moves

4. **If still not working:**
   - The USB0 reader may need to be replaced
   - Verify it's actually a PN532-based reader
   - Check for loose connections or damaged cables

### Option 2: Reconfigure to Use Only Working Reader

If you only need one reader temporarily:

1. **Stop reader-1 service:**
   ```bash
   sudo systemctl stop tap-broadcaster.service
   sudo systemctl disable tap-broadcaster.service
   ```

2. **Update browser settings:**
   - All staff should select "Reader 2" in settings
   - Everyone will use the same reader (no lane separation)

### Option 3: Swap Service Configurations

If the physical readers are labeled opposite to the USB ports:

1. **Edit service files to swap devices:**
   ```bash
   # Edit reader-1 to use USB1
   sudo nano /etc/systemd/system/tap-broadcaster.service
   # Change: Environment="PN532_DEVICE=tty:USB1:pn532"
   
   # Edit reader-2 to use USB0
   sudo nano /etc/systemd/system/tap-broadcaster-reader2.service
   # Change: Environment="PN532_DEVICE=tty:USB0:pn532"
   ```

2. **Reload and restart:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart tap-broadcaster.service tap-broadcaster-reader2.service
   ```

## Testing After Fix

Once you've fixed the hardware issue, test both readers:

```bash
cd /home/qiss/stuco
sudo systemctl stop tap-broadcaster.service tap-broadcaster-reader2.service
/home/qiss/stuco/.venv/bin/python3 test_readers.py
```

Expected output:
```
USB0 (ttyUSB0): ✓ WORKING
USB1 (ttyUSB1): ✓ WORKING
```

Then restart services:
```bash
sudo systemctl start tap-broadcaster.service tap-broadcaster-reader2.service
```

## Verification

After fixing, check the logs to ensure both readers are working:

```bash
# Watch for taps from both readers
sudo journalctl -u tap-broadcaster.service -u tap-broadcaster-reader2.service -f

# You should see:
# - Taps with "lane: reader-1" from reader-1 service
# - Taps with "lane: reader-2" from reader-2 service
```

## Software Status

The filtering software is working correctly:
- ✅ Broadcaster tagging is correct
- ✅ Server-side lane filtering works
- ✅ Client-side filtering works
- ✅ UI shows which reader is selected
- ❌ **Hardware issue prevents reader-1 from detecting cards**

## Next Steps

1. Run the hardware test script: `/home/qiss/stuco/test_readers.py`
2. Try swapping the physical USB connections
3. If USB0 reader is faulty, replace it or use Option 2 (single reader mode)
4. Once both readers work, the dual-lane system will function as designed

## Contact

If you need help identifying which physical reader is which:
- The test script will prompt you to tap a card on each reader
- Label the readers after identifying which port they're on
- USB0 = Reader 1, USB1 = Reader 2

