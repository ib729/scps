# NFC Reader Hardware Diagnostic Results

**Date:** $(date +%Y-%m-%d)
**Issue:** One NFC reader not working
**Root Cause:** USB port issue

## Test Results

### USB Port Testing
- ✅ **Bottom USB 2.0 port**: Both readers work reliably
- ❌ **Other USB port(s)**: Readers fail to work properly

### Component Testing
- ✅ **PN532 Reader #1**: Functional (tested on bottom port)
- ✅ **PN532 Reader #2**: Functional (tested on bottom port)
- ✅ **CH340G Adapter #1**: Functional (tested on bottom port)
- ✅ **CH340G Adapter #2**: Functional (tested on bottom port)

## Conclusion

**All hardware components are working correctly.**

The issue is with the USB port(s) on the Raspberry Pi, not with the NFC readers or CH340G adapters.

## Possible Causes for Port Issues

1. **USB Hub Issues**: If using a USB hub on the problematic port
   - Hub may not provide sufficient power
   - Hub may have compatibility issues with CH340 chipset

2. **Power Supply**: Insufficient power to USB ports
   - Raspberry Pi power supply may be inadequate
   - Too many USB devices drawing power simultaneously

3. **USB Bus Overload**: USB controller bandwidth limitations
   - Multiple high-speed devices on same bus

4. **Physical Port Damage**: Worn or damaged USB connector
   - Poor contact
   - Broken solder joints

5. **Driver/Kernel Issues**: Specific to certain USB ports
   - Check dmesg for port-specific errors

## Recommendations

### Immediate Solution
✅ **Use the bottom USB 2.0 port for both readers**
- This is the known-working port
- If you need to connect both readers simultaneously, use a **powered USB hub** on this port

### Powered USB Hub Setup
If you need multiple NFC readers:
```
Raspberry Pi Bottom USB Port
    ↓
Powered USB Hub (with external power adapter)
    ├─ CH340G + PN532 Reader #1
    └─ CH340G + PN532 Reader #2
```

**Recommended USB Hub Features:**
- External power adapter (5V 2A minimum)
- USB 2.0 compatible (USB 3.0 hubs sometimes have issues with CH340)
- Individual port power switches (optional but useful)

### Power Supply Check
Ensure your Raspberry Pi has adequate power:
- **Minimum**: 5V 2.5A (12.5W)
- **Recommended for multiple USB devices**: 5V 3A (15W) or higher
- Check for low voltage warnings:
  ```bash
  vcgencmd get_throttled
  # 0x0 = no issues
  # Non-zero = undervoltage or throttling detected
  ```

### USB Topology Check
Verify USB bus assignment:
```bash
# Show USB device tree
lsusb -t

# The bottom port should be on Bus 001
# Both readers on same hub should appear as separate devices
```

### Testing Problematic Ports
If you want to debug the non-working port:

1. **Test with working port first:**
   ```bash
   # Plug into bottom port
   lsusb | grep CH340
   ls -la /dev/ttyUSB*
   ```

2. **Move to problematic port:**
   ```bash
   # Unplug and move to other port
   lsusb | grep CH340  # Should still appear
   ls -la /dev/ttyUSB*  # May or may not appear
   ```

3. **Check kernel messages:**
   ```bash
   dmesg | tail -50
   # Look for USB errors, power issues, or device reset messages
   ```

4. **Common error patterns:**
   - `device not accepting address`: Power or signal issue
   - `device descriptor read error`: Bad USB connection
   - `unable to enumerate`: Driver or compatibility issue

### Long-term Solutions

1. **Label the working port**: Use tape/sticker to mark the bottom USB 2.0 port
2. **Use powered hub**: Prevents power-related issues
3. **Upgrade power supply**: If seeing undervoltage warnings
4. **Consider USB extension**: If port is physically damaged

## Configuration for Production

For your dual-reader setup:

### Option 1: Both on Powered Hub (Recommended)
```bash
# Both readers on hub connected to bottom port
Reader 1: /dev/ttyUSB0
Reader 2: /dev/ttyUSB1

# Update your tap-broadcaster configuration
python tap-broadcaster.py --port /dev/ttyUSB0 &
python tap-broadcaster.py --port /dev/ttyUSB1 &
```

### Option 2: Direct Connection (If only one reader needed)
```bash
# Single reader directly in bottom port
Reader: /dev/ttyUSB0

python tap-broadcaster.py --port /dev/ttyUSB0
```

## Monitoring

Set up monitoring to detect USB issues:

```bash
# Add to systemd service or cron
#!/bin/bash
# check_usb.sh - Alert if NFC reader disconnects

if ! lsusb | grep -q "CH340"; then
    echo "WARNING: NFC reader not detected!"
    # Send alert (email, webhook, etc.)
fi
```

## Summary

✅ **Hardware Status**: All NFC readers and CH340 adapters are working
❌ **Port Issue**: Some USB ports are not reliable
✓ **Solution**: Use bottom USB 2.0 port (with powered hub if needed)

---

**Next Steps:**
1. Continue using bottom USB 2.0 port for reliable operation
2. Consider powered USB hub if you need multiple readers
3. Check power supply if you experience any issues
4. Monitor for undervoltage warnings
