# NFC WebSocket Configuration Summary

## ✅ What Was Fixed

### 1. USB Device Configuration
- **Changed from:** `tty:AMA0:pn532` (UART/GPIO)
- **Changed to:** `tty:USB0:pn532` (USB connection)
- **Device detected:** CH340 serial converter at `/dev/ttyUSB0`

### 2. WebSocket Server Setup
- Created custom Node.js server with WebSocket support
- Installed `ws@8.18.3` package
- Server now runs on: `http://localhost:3000` with WebSocket at `ws://localhost:3000/api/nfc/ws`

### 3. Authentication Secret
- Generated secure random secret: `55ae2c9e1779b316d6d11b00d13c32a721e599ee21465dd927ed46dc1f3dd125`
- Added to `web-next/.env.local`
- Updated in `systemd/tap-broadcaster.service`

## Current Configuration

### Systemd Service File
Location: `/home/qiss/stuco/systemd/tap-broadcaster.service`

```ini
Environment="NEXTJS_URL=http://localhost:3000"
Environment="NFC_TAP_SECRET=55ae2c9e1779b316d6d11b00d13c32a721e599ee21465dd927ed46dc1f3dd125"
Environment="POS_LANE_ID=default"
Environment="PN532_DEVICE=tty:USB0:pn532"
```

### Test Results ✅
```
[WS] Authenticated successfully (lane: default)
[OK] Tap broadcast: DEADBEEF
[TEST] Test tap sent successfully
```

## How to Start Everything

### Development Mode

**Terminal 1 - Start Next.js with WebSocket:**
```bash
cd /home/qiss/stuco/web-next
pnpm dev
```

Wait for:
```
> Ready on http://localhost:3000
> WebSocket server ready on ws://localhost:3000/api/nfc/ws
```

**Terminal 2 - Test Broadcaster:**
```bash
cd /home/qiss/stuco
source .venv/bin/activate
python tap-broadcaster.py --simulate
```

Type UIDs like `DEADBEEF` to test.

### Production Mode (Systemd)

**Update and start systemd service:**
```bash
# Copy updated service file
sudo cp /home/qiss/stuco/systemd/tap-broadcaster.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable tap-broadcaster

# Start the service
sudo systemctl start tap-broadcaster

# Check status
sudo systemctl status tap-broadcaster

# View live logs
journalctl -u tap-broadcaster -f
```

**For Next.js server in production:**
```bash
cd /home/qiss/stuco/web-next
pnpm build
pnpm start  # Uses custom server with WebSocket
```

## Testing with Real NFC Reader

With your USB-connected PN532:

```bash
cd /home/qiss/stuco
source .venv/bin/activate

# Make sure server is running first!
python tap-broadcaster.py --device tty:USB0:pn532
```

Then tap NFC cards on the reader. You should see:
```
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
[NFC] Starting card reader loop on tty:USB0:pn532
[NFC] Waiting for card tap...
[OK] Tap broadcast: 04ABC123...
```

## Browser Testing

1. Open http://localhost:3000/pos
2. Select "Tap Card" mode
3. Open browser DevTools → Console
4. You should see: `[NFC WS] Authenticated successfully`
5. When you tap a card, it should auto-select the student

## Current Status

✅ **Working:**
- Custom Node.js server with WebSocket
- Python broadcaster connects via WebSocket
- USB device configured correctly
- Authentication working
- Server-side deduplication active

🔧 **Next Steps:**
1. Test with actual NFC card on your USB reader
2. If everything works, set up systemd services for production
3. Configure auto-start on boot
4. Set up nginx reverse proxy if needed (for HTTPS/production)

## Useful Commands

**Check if server is running:**
```bash
curl http://localhost:3000 && echo " - Server OK"
```

**Check USB device:**
```bash
ls -l /dev/ttyUSB0
```

**Kill all processes and restart:**
```bash
pkill -f "node server.js"
cd /home/qiss/stuco/web-next
nohup node server.js > /tmp/nextjs-ws.log 2>&1 &
```

**View server logs:**
```bash
tail -f /tmp/nextjs-ws.log
```

**Test broadcaster without running:**
```bash
cd /home/qiss/stuco
source .venv/bin/activate
python tap-broadcaster.py --test
```

## Files Modified

1. ✅ `/home/qiss/stuco/systemd/tap-broadcaster.service` - Updated device and secret
2. ✅ `/home/qiss/stuco/web-next/.env.local` - Added NFC_TAP_SECRET
3. ✅ `/home/qiss/stuco/web-next/package.json` - Added ws package, updated scripts
4. ✅ `/home/qiss/stuco/web-next/server.js` - Created custom WebSocket server
5. ✅ `/home/qiss/stuco/web-next/lib/tap-events-node.js` - Node.js compatible broadcaster

## Security Note

The secret `55ae2c9e1779b316d6d11b00d13c32a721e599ee21465dd927ed46dc1f3dd125` is now shared between:
- Next.js server (reads from .env.local)
- Python broadcaster (reads from environment variable or --secret flag)

Keep this secret secure and don't commit it to git!

