# NFC Reader Hardware Diagnostic Guide

This guide helps you systematically diagnose whether your NFC reader issue is caused by:
1. USB port
2. CH340G USB-to-serial adapter
3. PN532 NFC reader itself

## Quick Diagnostic

Run the diagnostic script:
```bash
python3 diagnose_nfc.py
```

## Manual Testing Steps

### Step 1: Test Different USB Ports

**Goal:** Determine if the USB port is the problem

1. Note which USB port the reader is currently in
2. Run: `lsusb` (note the output)
3. Unplug the reader
4. Plug into a **different USB port**
5. Run: `lsusb` again
   - ✓ Should see `1a86:7523 QinHeng Electronics CH340 serial converter`
6. Run: `ls -la /dev/ttyUSB*`
   - ✓ Should see `/dev/ttyUSB0` (or USB1, USB2, etc.)
7. Try to connect:
   ```bash
   python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print('Success:', clf.device); clf.close()"
   ```

**Result:**
- ✓ Works in different port → **Original USB port was bad**
- ✗ Still fails → **Not a USB port issue, continue to Step 2**

### Step 2: Test with Another CH340G Adapter

**Goal:** Determine if the CH340G adapter is the problem

**Prerequisites:** You need a spare CH340G adapter

1. Keep the same PN532 reader
2. Disconnect the PN532 from the current CH340G adapter
3. Connect the PN532 to the **spare CH340G adapter**:
   - PN532 VCC → CH340G 5V (or 3.3V depending on your jumper settings)
   - PN532 GND → CH340G GND
   - PN532 TX → CH340G RX (cross-connection)
   - PN532 RX → CH340G TX (cross-connection)
4. Plug the spare CH340G into USB
5. Check detection:
   ```bash
   lsusb | grep CH340
   ls -la /dev/ttyUSB*
   ```
6. Try to connect:
   ```bash
   python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print('Success:', clf.device); clf.close()"
   ```

**Result:**
- ✓ Works with spare adapter → **Original CH340G adapter is faulty**
- ✗ Still fails → **Not a CH340G issue, likely PN532 reader, continue to Step 3**

### Step 3: Test Another PN532 Reader

**Goal:** Confirm if the PN532 reader is the problem

**Prerequisites:** You need a spare PN532 reader

1. Keep the same CH340G adapter (or use the known-good one from Step 2)
2. Disconnect the problematic PN532 reader
3. Connect the **spare PN532 reader** to the CH340G:
   - Check your PN532 jumper settings (UART mode: HSU)
   - Connect: VCC, GND, TX→RX, RX→TX
4. Try to connect:
   ```bash
   python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print('Success:', clf.device); clf.close()"
   ```

**Result:**
- ✓ Works with spare PN532 → **Original PN532 reader is faulty**
- ✗ Still fails → **Check wiring, power, and jumper settings**

## Common Issues & Solutions

### Issue: CH340 shows in lsusb but no /dev/ttyUSB*

**Possible causes:**
- Driver not loaded
- Bad CH340G adapter
- Insufficient USB power

**Solutions:**
```bash
# Check if driver is loaded
lsmod | grep ch341

# Load driver manually
sudo modprobe ch341

# Check kernel messages for errors
dmesg | grep -i 'ch340\|ch341\|usb' | tail -20

# Check USB power (if using hub)
# Try plugging directly into Raspberry Pi USB port
```

### Issue: /dev/ttyUSB* exists but nfcpy can't connect

**Possible causes:**
- Wrong permissions
- PN532 not in correct mode (check jumpers)
- Bad wiring
- Faulty PN532

**Solutions:**
```bash
# Check permissions
ls -la /dev/ttyUSB0
sudo chmod 666 /dev/ttyUSB0

# Test with different baud rates
python3 -c "import serial; s = serial.Serial('/dev/ttyUSB0', 115200, timeout=1); print('OK')"

# Check PN532 jumper settings (should be HSU for UART mode)
# SEL0: OFF, SEL1: ON
```

### Issue: Reader works intermittently

**Possible causes:**
- Loose connection
- Bad solder joints
- Power issues

**Solutions:**
- Check all wire connections
- Wiggle wires while testing
- Try shorter wires
- Check solder joints on CH340G and PN532
- Use powered USB hub

## Quick Commands Reference

```bash
# List USB devices
lsusb

# List serial ports
ls -la /dev/ttyUSB*

# Check kernel messages
dmesg | tail -50

# Test serial connection
python3 -c "import serial; s = serial.Serial('/dev/ttyUSB0', 115200); print('OK')"

# Test NFC reader
python3 -c "import nfc; clf = nfc.ContactlessFrontend('tty:USB0:pn532'); print(clf.device); clf.close()"

# Monitor USB events (run in separate terminal)
watch -n 1 lsusb

# Watch kernel messages (run in separate terminal)
sudo dmesg -w
```

## Testing Matrix

| Component | Test | Expected Result |
|-----------|------|----------------|
| USB Port | Plug into different port | Shows in lsusb |
| CH340G Driver | Check lsmod \| grep ch341 | Driver loaded |
| CH340G Hardware | Check /dev/ttyUSB* | Device file exists |
| PN532 Connection | Test with nfcpy | Connects successfully |
| Wiring | Visual inspection | TX↔RX crossed, VCC/GND correct |

## Decision Tree

```
Reader not working
    |
    ├─ Not in lsusb?
    │   ├─ Try different USB port → Works? = Bad USB port
    │   ├─ Try different cable → Works? = Bad cable
    │   └─ Still fails? = Bad CH340G or PN532
    |
    ├─ In lsusb but no /dev/ttyUSB*?
    │   ├─ Load driver (modprobe ch341) → Works? = Driver issue
    │   └─ Still fails? = Bad CH340G
    |
    └─ Has /dev/ttyUSB* but nfcpy fails?
        ├─ Swap CH340G → Works? = Bad original CH340G
        ├─ Swap PN532 → Works? = Bad original PN532
        └─ Still fails? = Wiring or configuration issue
```

## Record Your Findings

As you test, record your results:

```
Test Results:
[ ] USB Port Test: Port ___ works? Yes/No
[ ] CH340G shows in lsusb? Yes/No
[ ] /dev/ttyUSB* exists? Yes/No
[ ] Spare CH340G works? Yes/No (if tested)
[ ] Spare PN532 works? Yes/No (if tested)

Conclusion:
[ ] Bad USB port
[ ] Bad CH340G adapter
[ ] Bad PN532 reader
[ ] Wiring/jumper issue
[ ] Other: ___________
```

## Next Steps After Diagnosis

- **Bad USB port**: Use a different port or USB hub
- **Bad CH340G**: Replace the adapter (~$2-5)
- **Bad PN532**: Replace the reader (~$5-10)
- **Wiring issue**: Check/resolder connections
- **Configuration**: Check PN532 jumpers (HSU mode for UART)
