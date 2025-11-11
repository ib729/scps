# Testing Guide

This guide provides comprehensive testing procedures for the WebSocket-based NFC tap detection system and overall functionality.

## Prerequisites

1. **Install Python dependencies**:
   ```bash
   cd /home/qiss/stuco
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Set environment variables** (in `web-next/.env.local`):
   ```
   NFC_TAP_SECRET=test-secret-123
   ```

3. **Start Next.js server**:
   ```bash
   cd web-next
   pnpm dev
   ```

## Test 1: Python Broadcaster Test Mode

**Purpose**: Verify WebSocket connection and authentication

```bash
cd /home/qiss/stuco
source .venv/bin/activate
python tap-broadcaster.py --test --secret test-secret-123
```

**Expected output**:
```
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for Stuco POS System             ║
║                    WebSocket Version                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  http://localhost:3000                               ║
║ Lane:    default                                             ║
║ Device:  tty:AMA0:pn532                                      ║
║ Secret:  [SET]                                               ║
║ Mode:    TEST                                                ║
╚═══════════════════════════════════════════════════════════════╝

[TEST] Sending test tap event...
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
[OK] Tap broadcast: DEADBEEF
[TEST] Test tap sent successfully
```

**Pass criteria**:
- ✅ WebSocket connects successfully
- ✅ Authentication succeeds
- ✅ Test tap is sent
- ✅ Exit code 0

**Fail scenarios**:
- Connection refused → Server not running
- Auth failed → Secret mismatch
- Timeout → Network or WebSocket support issue

## Test 2: Simulation Mode (No Hardware)

**Purpose**: Test tap detection without NFC hardware

```bash
python tap-broadcaster.py --simulate --secret test-secret-123
```

**Actions**:
1. Type: `DEADBEEF` + Enter
2. Type: `CAFE1234` + Enter
3. Type: `quit` + Enter

**Expected output**:
```
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
[SIMULATE] Manual UID entry mode. Type UID hex (or 'quit'):
> DEADBEEF
[OK] Tap broadcast: DEADBEEF
> CAFE1234
[OK] Tap broadcast: CAFE1234
> quit

[EXIT] Exiting simulation mode.
```

**Pass criteria**:
- ✅ Each UID is broadcast successfully
- ✅ WebSocket stays connected
- ✅ Clean exit on 'quit'

## Test 3: Browser Client Connection (POS Page)

**Purpose**: Verify browser WebSocket connection and tap reception

**Steps**:
1. Open browser to http://localhost:3000/pos
2. Open browser DevTools → Console
3. Select "Tap Card" mode in POS form
4. In another terminal, run simulation:
   ```bash
   python tap-broadcaster.py --simulate --secret test-secret-123
   ```
5. Type `DEADBEEF` in simulation terminal

**Expected behavior**:
- ✅ Console shows: `[NFC WS] Connection opened`
- ✅ Console shows: `[NFC WS] Authenticated successfully`
- ✅ Status indicator shows "Connected"
- ✅ After typing UID: Console shows `[POS] Card tap detected: DEADBEEF`
- ✅ UI responds to tap (enrollment dialog or student selection)

**Pass criteria**:
- ✅ WebSocket connection established
- ✅ Tap events received in real-time
- ✅ UI updates correctly

## Test 4: Browser Client Connection (Non-POS Page)

**Purpose**: Verify TapAlert component WebSocket connection

**Steps**:
1. Navigate to http://localhost:3000/dashboard
2. Open browser DevTools → Console
3. Run simulation and type a UID

**Expected behavior**:
- ✅ Console shows WebSocket connection
- ✅ Drawer/toast appears with card information
- ✅ Option to navigate to POS

## Test 5: Hardware Test (UART Connection)

**Purpose**: Test with actual PN532 NFC reader

**Prerequisites**:
- PN532 connected via UART (GPIO pins)
- User in `dialout` group: `groups | grep dialout`

```bash
# Check device exists
ls -l /dev/ttyAMA0

# Run broadcaster
python tap-broadcaster.py --device tty:AMA0:pn532 --secret test-secret-123
```

**Actions**:
1. Tap an NFC card on reader
2. Remove card
3. Tap same card again after 2 seconds
4. Tap different card

**Expected behavior**:
```
[NFC] Starting card reader loop on tty:AMA0:pn532
[NFC] Waiting for card tap...
[OK] Tap broadcast: 04ABC123
[OK] Tap broadcast: 04ABC123  # (after removal and re-tap)
[OK] Tap broadcast: 04XYZ789  # (different card)
```

**Pass criteria**:
- ✅ Card UIDs detected correctly
- ✅ No duplicate taps while card remains on reader
- ✅ Can re-tap after removal
- ✅ Multiple cards work

**Troubleshooting**:
- "Permission denied" → Add user to dialout group and reboot
- "Device not found" → Check `/dev/ttyAMA0` exists
- No detection → Check wiring, try `nfc-list` command

## Test 6: USB Connection Test

**Purpose**: Test PN532 via USB

```bash
# List USB devices
lsusb | grep -i nfc

# Check for ttyUSB devices
ls -l /dev/ttyUSB*

# Run with USB device
python tap-broadcaster.py --device tty:USB0:pn532 --secret test-secret-123
```

**Pass criteria**: Same as UART test

## Test 7: Duplicate Tap Prevention

**Purpose**: Verify server-side and client-side deduplication

**Method 1 - Simulation**:
```bash
python tap-broadcaster.py --simulate --secret test-secret-123
```
Type same UID multiple times rapidly:
```
> DEADBEEF
> DEADBEEF
> DEADBEEF
```

**Expected output**:
```
[OK] Tap broadcast: DEADBEEF
[OK] Tap broadcast: DEADBEEF  # Should still send (different "taps")
```

**Note**: Python broadcaster tracks card presence. In simulation, each entry is treated as a new tap. Server-side deduplication (1s window) should prevent UI from processing duplicates too quickly.

**Method 2 - Check server logs**:
Watch Next.js console for:
```
[TapBroadcaster] Broadcasting tap: DEADBEEF (X listeners)
[TapBroadcaster] Duplicate tap ignored: DEADBEEF (within 1000ms)
```

**Pass criteria**:
- ✅ Server detects and logs duplicates within 1s window
- ✅ UI only processes unique taps

## Test 8: Auto-Reconnection

**Purpose**: Verify automatic reconnection on disconnect

**Steps**:
1. Start broadcaster in simulation mode
2. Stop Next.js server (Ctrl+C in server terminal)
3. Observe broadcaster logs
4. Restart Next.js server
5. Observe broadcaster reconnects

**Expected behavior**:
```
[WS] Connection closed: 1006
[WS] Reconnecting in 1s...
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connection error: ...
[WS] Reconnecting in 2s...
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connection error: ...
[WS] Reconnecting in 4s...
# (exponential backoff continues)
# After server restart:
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
```

**Pass criteria**:
- ✅ Broadcaster detects disconnect
- ✅ Exponential backoff works (1s, 2s, 4s, 8s, ...)
- ✅ Reconnects automatically when server available
- ✅ Re-authenticates successfully

## Test 9: Multiple Browser Clients

**Purpose**: Verify multiple clients can connect simultaneously

**Steps**:
1. Open POS page in Browser 1 (tab 1)
2. Open POS page in Browser 2 (tab 2) or incognito mode
3. Run simulation and send a tap
4. Both tabs should receive the tap event

**Pass criteria**:
- ✅ Both clients connect successfully
- ✅ Both clients receive tap events
- ✅ No interference between clients

## Test 10: Systemd Service

**Purpose**: Verify production service configuration

```bash
# Copy service file
sudo cp systemd/tap-broadcaster.service /etc/systemd/system/

# Edit if needed (set correct device, secret, etc.)
sudo nano /etc/systemd/system/tap-broadcaster.service

# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start tap-broadcaster

# Check status
sudo systemctl status tap-broadcaster

# View logs
journalctl -u tap-broadcaster -f
```

**Expected status output**:
```
● tap-broadcaster.service - NFC Tap Broadcaster for Stuco POS (WebSocket)
   Loaded: loaded (/etc/systemd/system/tap-broadcaster.service; enabled)
   Active: active (running) since ...
```

**Pass criteria**:
- ✅ Service starts without errors
- ✅ Logs show WebSocket connection
- ✅ Logs show authentication success
- ✅ Service restarts on failure (RestartSec=5)
- ✅ Auto-starts on boot (if enabled)

```bash
# Test restart on failure
sudo kill -9 $(pgrep -f tap-broadcaster)
sleep 6
sudo systemctl status tap-broadcaster  # Should be running again
```

## Test 11: Lane Filtering

**Purpose**: Verify multi-lane support

**Terminal 1** (Lane A):
```bash
POS_LANE_ID=lane-a python tap-broadcaster.py --simulate --secret test-secret-123
```

**Terminal 2** (Lane B):
```bash
POS_LANE_ID=lane-b python tap-broadcaster.py --simulate --secret test-secret-123
```

**Browser**:
- Open http://localhost:3000/pos?lane=lane-a
- Should only receive taps from Terminal 1

**Pass criteria**:
- ✅ Both broadcasters connect to different lanes
- ✅ POS page filters by lane correctly
- ✅ No cross-lane interference

## Test Summary Checklist

After running all tests, verify:

- [ ] Test mode works (test 1)
- [ ] Simulation mode works (test 2)
- [ ] Browser client connects on POS page (test 3)
- [ ] Browser client connects on other pages (test 4)
- [ ] Hardware UART works (test 5) - if available
- [ ] Hardware USB works (test 6) - if available
- [ ] Duplicate prevention works (test 7)
- [ ] Auto-reconnection works (test 8)
- [ ] Multiple clients work (test 9)
- [ ] Systemd service works (test 10)
- [ ] Lane filtering works (test 11)

## Common Issues

### WebSocket Not Supported
**Error**: "WebSocket not supported in this environment"

**Cause**: Next.js may not have native WebSocket support in all runtimes

**Solution**: Check Next.js version and runtime. May need to deploy to Vercel or use custom server.

### Authentication Failures
**Error**: `[WS] Authentication failed`

**Cause**: NFC_TAP_SECRET mismatch

**Fix**:
1. Check `web-next/.env.local` has `NFC_TAP_SECRET=your-secret`
2. Set same secret when running broadcaster: `--secret your-secret`
3. For systemd, edit service file Environment variable

### Card Not Detected
**Error**: No output when tapping card

**Possible causes**:
1. Device wrong: Check `ls /dev/tty*` for correct device
2. Permissions: Add user to dialout group
3. Hardware: Check wiring, try `nfc-list` to test reader
4. Library: Install nfcpy or libnfc-bin

## Performance Metrics

Expected performance:
- **Latency**: < 200ms from tap to UI update
- **Reconnection**: < 5s after server restart
- **Memory**: ~50MB Python process, ~500MB Next.js
- **CPU**: < 5% idle, < 20% during tap processing

## Next Steps

After testing:
1. Update NFC_TAP_SECRET to strong production value
2. Enable systemd service for auto-start
3. Configure HTTPS for production (WSS)
4. Monitor logs for any issues
5. Set up log rotation for systemd service

## Reporting Issues

If tests fail, collect:
1. Python broadcaster output
2. Next.js console output
3. Browser console logs (DevTools)
4. systemd logs: `journalctl -u tap-broadcaster -n 200`
5. Environment details: OS, Python version, Next.js version

**Last updated: November 11, 2025**
