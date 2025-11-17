# Dual NFC Reader Setup Guide

This guide explains how to run two NFC readers simultaneously with per-staff filtering.

## Overview

The system now supports multiple NFC readers working simultaneously:
- **Auto-detection**: Each broadcaster automatically detects which USB port it's using
- **Reader identification**: Readers are labeled as `reader-1` (ttyUSB0), `reader-2` (ttyUSB1), etc.
- **Per-client filtering**: Each staff member selects their reader in Settings, and only sees taps from that reader
- **Persistent selection**: Reader choice is saved in browser localStorage

## Architecture

```
┌─────────────────┐
│  NFC Reader 1   │
│  (ttyUSB0)      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ tap-broadcaster.py #1   │
│ Auto-detects: reader-1  │
└────────┬────────────────┘
         │
         │  WebSocket (lane=reader-1)
         ▼
┌──────────────────────────────┐
│      server.js (WebSocket)   │
│   Lane-based filtering       │
└────────┬─────────────────────┘
         │
         ├─────────────────────────┐
         │                         │
         ▼                         ▼
  ┌─────────────┐         ┌─────────────┐
  │  Staff A    │         │  Staff B    │
  │  Web UI     │         │  Web UI     │
  │ reader-1    │         │ reader-2    │
  └─────────────┘         └─────────────┘
```

## Setup Instructions

### 1. Hardware Setup

1. Connect both NFC readers to different USB ports
2. Verify both appear as `/dev/ttyUSB*` devices:
   ```bash
   ls -l /dev/ttyUSB*
   ```
   Expected output:
   ```
   /dev/ttyUSB0
   /dev/ttyUSB1
   ```

### 2. Start First Broadcaster (Reader 1)

The broadcaster will auto-detect ttyUSB0 and identify as `reader-1`:

```bash
python tap-broadcaster.py --url http://localhost:3000 --secret YOUR_SECRET
```

Expected output:
```
[DEVICE] Detected: /dev/ttyUSB0 -> tty:USB0:pn532 (reader-1)
[DEVICE] Successfully opened tty:USB0:pn532 as reader-1
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for SCPS POS System              ║
║                    WebSocket Version                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  http://localhost:3000                               ║
║ Lane:    default                                             ║
║ Reader:  reader-1                                            ║
║ Device:  tty:USB0:pn532                                      ║
║ Secret:  [SET]                                               ║
║ Mode:    HARDWARE                                            ║
╚═══════════════════════════════════════════════════════════════╝
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] ✓ Broadcaster authenticated successfully (lane: reader-1)
[NFC] Starting card reader loop on tty:USB0:pn532
[NFC] Reader ID: reader-1
[NFC] Waiting for card tap...
```

### 3. Start Second Broadcaster (Reader 2)

In a new terminal, start the second broadcaster. It will auto-detect ttyUSB1:

```bash
python tap-broadcaster.py --url http://localhost:3000 --secret YOUR_SECRET
```

Expected output:
```
[DEVICE] Detected: /dev/ttyUSB1 -> tty:USB1:pn532 (reader-2)
[DEVICE] Successfully opened tty:USB1:pn532 as reader-2
...
║ Reader:  reader-2                                            ║
...
[WS] ✓ Broadcaster authenticated successfully (lane: reader-2)
[NFC] Reader ID: reader-2
```

### 4. Web UI Configuration

#### Staff A (Using Reader 1):
1. Open web UI at `http://localhost:3000/pos`
2. When prompted, select **Reader 1** (ttyUSB0)
3. Or later: Click avatar → Settings → Select "Reader 1" → Save

#### Staff B (Using Reader 2):
1. Open web UI in different browser/tab at `http://localhost:3000/pos`
2. When prompted, select **Reader 2** (ttyUSB1)
3. Or later: Click avatar → Settings → Select "Reader 2" → Save

### 5. Testing

1. **Test Reader 1 isolation**:
   - Staff A should have Reader 1 selected
   - Staff B should have Reader 2 selected
   - Tap a card on Reader 1
   - **Expected**: Only Staff A sees the tap

2. **Test Reader 2 isolation**:
   - Tap a card on Reader 2
   - **Expected**: Only Staff B sees the tap

3. **Verify server logs**:
   ```bash
   # In web server logs, you should see:
   [WS #1] Sending tap event to client: <UID> (lane: reader-1)
   [WS #2] Skipping tap <UID> - client lane='reader-2' event lane='reader-1'
   ```

## Troubleshooting

### Issue: Broadcaster can't detect readers

**Symptom**:
```
[DEVICE] No /dev/ttyUSB* devices found
```

**Solution**:
1. Check USB connections:
   ```bash
   lsusb | grep 1a86:7523  # Look for CH340 adapters
   ```
2. Check kernel driver:
   ```bash
   dmesg | grep ttyUSB
   ```
3. Verify device permissions:
   ```bash
   ls -l /dev/ttyUSB*
   sudo chmod 666 /dev/ttyUSB*  # If needed
   ```

### Issue: Both broadcasters detect same reader

**Symptom**:
```
[DEVICE] Successfully opened tty:USB0:pn532 as reader-1  # Both instances
```

**Solution**:
The first broadcaster that successfully opens a reader "locks" it. Start broadcasters sequentially:
1. Start first broadcaster, wait for "Reader ID: reader-1"
2. Then start second broadcaster

### Issue: Staff sees taps from wrong reader

**Symptom**: Staff A (reader-1) sees taps from Reader 2

**Solution**:
1. Check selected reader in Settings (avatar → Settings)
2. Verify broadcaster is sending correct reader_id:
   ```bash
   # In broadcaster logs:
   [OK] Tap broadcast: <UID> (reader: reader-1)
   ```
3. Clear localStorage and reselect:
   ```javascript
   // In browser console:
   localStorage.removeItem('nfc_reader_lane')
   location.reload()
   ```

### Issue: Reader auto-detects as wrong ID

**Symptom**: ttyUSB1 detected as reader-1 instead of reader-2

**Explanation**: Reader IDs are assigned based on the order broadcasters successfully connect, not the USB port number. This is intentional for flexibility.

**Solution**: If you need consistent mapping:
1. Always start broadcasters in the same order
2. Or manually specify device and lane:
   ```bash
   # Broadcaster 1:
   python tap-broadcaster.py --device tty:USB0:pn532 --lane reader-1

   # Broadcaster 2:
   python tap-broadcaster.py --device tty:USB1:pn532 --lane reader-2
   ```

## Running as Services

For production, run both broadcasters as systemd services:

### Reader 1 Service

Create `/etc/systemd/system/nfc-broadcaster-1.service`:
```ini
[Unit]
Description=NFC Tap Broadcaster (Reader 1)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT
Environment="NEXTJS_URL=http://localhost:3000"
Environment="NFC_TAP_SECRET=your-secret-here"
ExecStart=/usr/bin/python3 $PROJECT_ROOT/tap-broadcaster.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Reader 2 Service

Create `/etc/systemd/system/nfc-broadcaster-2.service`:
```ini
[Unit]
Description=NFC Tap Broadcaster (Reader 2)
After=network.target nfc-broadcaster-1.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT
Environment="NEXTJS_URL=http://localhost:3000"
Environment="NFC_TAP_SECRET=your-secret-here"
ExecStart=/usr/bin/python3 $PROJECT_ROOT/tap-broadcaster.py
Restart=always
RestartSec=10
# Add 5 second delay to ensure reader-1 connects first
ExecStartPre=/bin/sleep 5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable nfc-broadcaster-1 nfc-broadcaster-2
sudo systemctl start nfc-broadcaster-1
sleep 5
sudo systemctl start nfc-broadcaster-2

# Check status:
sudo systemctl status nfc-broadcaster-1
sudo systemctl status nfc-broadcaster-2
```

## How It Works

### Auto-Detection Algorithm

1. **Device Discovery**:
   - Scans for `/dev/ttyUSB*` devices using `glob.glob()`
   - Sorts alphabetically (USB0, USB1, USB2, ...)

2. **Reader Assignment**:
   - For each device, attempts to open with `nfc.ContactlessFrontend()`
   - First successful device → `reader-1`
   - Second successful device → `reader-2`
   - And so on...

3. **Identifier Propagation**:
   - `reader_id` included in every tap WebSocket message
   - `lane` field set to `reader_id` for backward compatibility
   - Server routes messages based on `lane` parameter

### Client-Side Filtering

1. **Reader Selection**:
   - Stored in localStorage: `nfc_reader_lane`
   - Managed by `NFCReaderContext` React context
   - Persists across page reloads

2. **WebSocket Connection**:
   - Client connects with `?lane=reader-1` query parameter
   - Server only sends taps matching that lane
   - Automatic reconnection when reader selection changes

3. **Settings UI**:
   - Available in sidebar avatar menu → Settings
   - Radio buttons for Reader 1 / Reader 2
   - Shows device path (ttyUSB0, ttyUSB1) for reference

## Example Scenario

**Setup**: School snack bar with 2 NFC readers

**Staff A** (Cashier 1):
- Opens `/pos` page
- Selects "Reader 1" when prompted
- Handles student purchases at register #1
- Only sees taps from their physical reader

**Staff B** (Cashier 2):
- Opens `/pos` page on different computer
- Selects "Reader 2" when prompted
- Handles student purchases at register #2
- Only sees taps from their physical reader

**Result**: Both cashiers work independently without interference!

## Advanced Configuration

### Manual Reader Assignment

If auto-detection doesn't work or you need specific mappings:

```bash
# Force specific reader assignment:
python tap-broadcaster.py \
  --device tty:USB0:pn532 \
  --lane reader-1 \
  --url http://localhost:3000 \
  --secret YOUR_SECRET
```

### Simulation Mode

Test filtering without hardware:

```bash
# Terminal 1 (simulate reader-1):
python tap-broadcaster.py --simulate --lane reader-1
> ABC123

# Terminal 2 (simulate reader-2):
python tap-broadcaster.py --simulate --lane reader-2
> DEF456
```

### Debug Logging

Enable verbose WebSocket logs in `server.js` (lines 303-330):
```javascript
console.log(`[WS #${connectionId}] Sending tap event to client: ${event.card_uid} (lane: ${eventLane})`);
```

## Summary

✅ **Auto-detection** - No manual configuration needed
✅ **Per-staff filtering** - Each staff member sees only their reader's taps
✅ **Persistent selection** - Reader choice saved in browser
✅ **Easy setup** - Just start multiple broadcasters
✅ **Production ready** - Systemd service configurations included

The system automatically handles reader identification and routing, making it simple to scale from one to multiple NFC readers!
