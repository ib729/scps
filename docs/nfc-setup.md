# NFC Card Tap Integration

This guide sets up NFC tap support for the Student Council Payment System POS, enabling card taps to auto-select students in the web UI.

## Overview

**NFC Flow (POS Only)**:
1. Student taps card on PN532 reader.
2. `tap-broadcaster.py` detects UID and sends via WebSocket to `/api/nfc/ws`.
3. Next.js broadcasts via WebSocket to connected browsers.
4. POS UI auto-selects student.
5. Staff enters amount and charges.

**Top-ups**: Manual selection only (no taps).

**Architecture**:
- **WebSocket-based**: Lower latency, bidirectional communication
- **Card presence tracking**: Prevents duplicate tap detections
- **Auto-reconnection**: Both broadcaster and clients reconnect automatically
- **Server-side deduplication**: Additional protection against duplicates

**Recent Updates**:
- **WebSocket upgrade**: Replaced HTTP POST + SSE with full WebSocket architecture
- POS modes: "Tap Card" (NFC) vs "Manual".
- Global toasts: Alerts on non-POS pages guide to POS.
- Unenrolled cards: Options to enroll + POS/Top-up/Only.

## Requirements

- **Hardware**: PN532 NFC reader (UART/USB), Raspberry Pi 4B+.
- **Software**: Python 3.9+, nfcpy (TTY/USB) or libnfc-bin (I2C).
- **Web UI**: Running Next.js with NFC endpoints.

## WebSocket Server Setup (Self-Hosted Node.js)

Since you're self-hosting on Node.js (not Vercel), a custom server is required for WebSocket support.

### What is Required

1. **Custom Server** (`web-next/server.js`):
   - Node.js HTTP server with WebSocket support using `ws` package.
   - Handles Next.js requests and WebSocket connections at `ws://localhost:3000/api/nfc/ws`.

2. **Node.js-Compatible Broadcaster** (`web-next/lib/tap-events-node.js`):
   - CommonJS version for the custom server.
   - Includes deduplication logic.

3. **Dependencies**: `ws@^8.18.0` in `web-next/package.json`.

### Installation Steps

1. **Install WebSocket Package**:
   ```bash
   cd /home/qiss/stuco/web-next
   pnpm install ws@^8.18.0
   ```

2. **Install Python WebSocket Library**:
   ```bash
   cd /home/qiss/stuco
   source .venv/bin/activate
   pip install websockets==13.1
   ```

3. **Update package.json Scripts** (if not already):
   - `dev`: Uses custom server for development.
   - `start`: For production.

4. **Start the Server**:

   **Development:**
   ```bash
   cd /home/qiss/stuco/web-next
   pnpm dev
   ```

   You should see:
   ```
   > Ready on http://localhost:3000
   > WebSocket server ready on ws://localhost:3000/api/nfc/ws
   ```

   **Production:**
   ```bash
   cd /home/qiss/stuco/web-next
   pnpm build
   pnpm start
   ```

5. **Configure Shared Secret**:
   Generate and set `NFC_TAP_SECRET` in `web-next/.env.local`:
   ```bash
   openssl rand -hex 32
   ```
   ```
   NFC_TAP_SECRET=your-generated-secret
   ```

6. **Test Connection**:
   ```bash
   cd /home/qiss/stuco
   source .venv/bin/activate
   python tap-broadcaster.py --test --secret your-generated-secret
   ```

   Expected:
   ```
   [WS] Connected successfully
   [WS] Authenticated successfully (lane: default)
   [OK] Tap broadcast: DEADBEEF
   [TEST] Test tap sent successfully
   ```

### Systemd Service for Web UI (Production)

Update `stuco-web.service` to use custom server:

```ini
[Service]
...
ExecStart=/usr/bin/node /home/qiss/stuco/web-next/server.js
...
```

Or with pnpm:
```ini
ExecStart=/usr/bin/pnpm start
```

## Installation

1. **Python Dependencies**:

   ```bash
   source .venv/bin/activate
   pip install -r requirements.txt  # Includes websockets, nfcpy
   ```

   For I2C (libnfc):
   ```bash
   sudo apt install libnfc-bin libnfc-dev
   ```

2. **Permissions** (Raspberry Pi):

   ```bash
   sudo usermod -aG dialout $USER  # For serial devices
   sudo usermod -aG i2c $USER      # For I2C
   # Logout/login
   ```

3. **Web UI Config**:

   In `web-next/.env.local`:
   ```
   NFC_TAP_SECRET=your-strong-secret  # Shared with broadcaster
   ```

## NFC Device Configuration

### USB Device Setup

- **Default**: `tty:USB0:pn532` for USB-connected PN532 with CH340 serial converter.
- **Detect Device**:
  ```bash
  lsusb | grep -i ch340  # Or similar serial converter
  ls -l /dev/ttyUSB*
  ```
- **Update Broadcaster**:
  ```bash
  PN532_DEVICE=tty:USB0:pn532 python tap-broadcaster.py
  ```

### UART Device Setup

- **Default**: `tty:AMA0:pn532` for GPIO UART.
- **Enable UART** (Raspberry Pi):
  ```bash
  sudo raspi-config  # Interface Options → Serial Port → No login shell, Yes hardware
  sudo reboot
  ```

## Tap Broadcaster Setup

`tap-broadcaster.py` reads cards and broadcasts to web UI via WebSocket.

### Features

- **WebSocket connection**: Persistent connection with automatic reconnection
- **Card presence tracking**: Detects when cards are removed, prevents duplicates
- **Async operation**: Non-blocking, efficient resource usage
- **Graceful error handling**: Exponential backoff on connection failures
- **Simulation mode**: Test without hardware
- **Test mode**: Send single test tap

### Environment Variables

- `NEXTJS_URL`: Web server (default: http://localhost:3000).
- `NFC_TAP_SECRET`: Auth secret (matches web UI).
- `POS_LANE_ID`: For multi-lane (default: "default").
- `PN532_DEVICE`: Reader device (default: tty:AMA0:pn532 for UART).

### Usage

#### Simulation (No Hardware)

```bash
python tap-broadcaster.py --simulate
# Type UID hex (e.g., DEADBEEF) or 'quit'
```

#### Hardware (TTY/USB - nfcpy)

```bash
python tap-broadcaster.py --device tty:AMA0:pn532  # UART
python tap-broadcaster.py --device tty:USB0:pn532  # USB
```

#### Hardware (I2C - libnfc)

Uses `nfc-list` CLI; auto-detects.

```bash
python tap-broadcaster.py --device i2c:/dev/i2c-1:pn532
```

#### Test

```bash
python tap-broadcaster.py --test  # Sends fake UID "DEADBEEF"
```

**Output**:
```
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for SCPS POS System              ║
║                    WebSocket Version                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  http://localhost:3000                               ║
║ Lane:    default                                             ║
║ Device:  tty:AMA0:pn532                                      ║
║ Secret:  [SET]                                               ║
║ Mode:    HARDWARE                                            ║
╚═══════════════════════════════════════════════════════════════╝

[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
[NFC] Starting card reader loop on tty:AMA0:pn532
[NFC] Waiting for card tap...
[OK] Tap broadcast: DEADBEEF
```

### Multi-Lane Setup

For multiple checkouts:

- Broadcaster 1: `POS_LANE_ID=lane-a python tap-broadcaster.py --device tty:AMA0:pn532`
- Broadcaster 2: `POS_LANE_ID=lane-b python tap-broadcaster.py --device tty:USB0:pn532`
- POS URL: `/pos?lane=lane-a` (filters WebSocket events).

## Dual Reader Setup (Two Simultaneous NFC Readers)

### Overview

This setup allows two NFC readers to operate simultaneously, enabling multiple staff members to work at different checkout stations. Each staff member selects their preferred reader via the Web UI Settings dialog, and tap events are routed accordingly.

**Architecture:**
- Two `tap-broadcaster.py` instances running as systemd services
- Reader 1: `/dev/ttyUSB0` with lane ID `reader-1`
- Reader 2: `/dev/ttyUSB1` with lane ID `reader-2`
- Web UI: Settings dialog for reader selection (persists per staff member in localStorage)

### Hardware Setup

1. **Connect both NFC readers** to USB ports on the Raspberry Pi
2. **Verify device detection:**
   ```bash
   ls /dev/ttyUSB*
   # Should show: /dev/ttyUSB0  /dev/ttyUSB1
   ```
3. **Check device mapping:**
   ```bash
   lsusb | grep -i "CH340\|QinHeng"
   # Should show 2 CH340 devices
   ```

### Service Installation

1. **Copy service files:**
   ```bash
   sudo cp systemd/tap-broadcaster.service /etc/systemd/system/
   sudo cp systemd/tap-broadcaster-reader2.service /etc/systemd/system/
   ```

2. **Verify configuration** (already set in service files):
   - `tap-broadcaster.service`: `POS_LANE_ID=reader-1`, `PN532_DEVICE=tty:USB0:pn532`
   - `tap-broadcaster-reader2.service`: `POS_LANE_ID=reader-2`, `PN532_DEVICE=tty:USB1:pn532`

3. **Enable and start both services:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable tap-broadcaster tap-broadcaster-reader2
   sudo systemctl start tap-broadcaster tap-broadcaster-reader2
   ```

4. **Check status:**
   ```bash
   sudo systemctl status tap-broadcaster
   sudo systemctl status tap-broadcaster-reader2
   ```

### Web UI Usage

1. **Open Web UI** and log in
2. **Click on your avatar** in the sidebar (bottom left)
3. **Select "Settings"** from the dropdown menu
4. **Under "NFC Reader Selection":**
   - Choose **Reader 1** (USB Port 0) or **Reader 2** (USB Port 1)
   - Click **Save Settings**
5. **Your selection persists** across page reloads and browser sessions

**Multi-Staff Workflow:**
- Staff A opens Web UI on Device/Browser 1, selects Reader 1
- Staff B opens Web UI on Device/Browser 2, selects Reader 2
- Card taps on Reader 1 only appear on Staff A's screen
- Card taps on Reader 2 only appear on Staff B's screen

### Service Management

**View logs for both readers:**
```bash
# Reader 1 (ttyUSB0)
sudo journalctl -u tap-broadcaster -f

# Reader 2 (ttyUSB1)
sudo journalctl -u tap-broadcaster-reader2 -f

# Both together
sudo journalctl -u tap-broadcaster -u tap-broadcaster-reader2 -f
```

**Restart a specific reader:**
```bash
sudo systemctl restart tap-broadcaster        # Reader 1
sudo systemctl restart tap-broadcaster-reader2 # Reader 2
```

**Stop/Start both readers:**
```bash
sudo systemctl stop tap-broadcaster tap-broadcaster-reader2
sudo systemctl start tap-broadcaster tap-broadcaster-reader2
```

### USB Device Reset

The USB reset script now supports both devices:

```bash
# Reset all CH340 devices
./scripts/reset-usb-nfc.sh

# Reset specific device
./scripts/reset-usb-nfc.sh USB0  # Reset Reader 1 only
./scripts/reset-usb-nfc.sh USB1  # Reset Reader 2 only
```

### Troubleshooting Dual Readers

**Problem: Only one reader detected**

Check USB devices:
```bash
ls /dev/ttyUSB*
lsusb | grep -i "CH340\|QinHeng"
```

If only one device shows:
- Check physical USB connections
- Try different USB ports
- Check `dmesg | tail -20` for USB errors

**Problem: Only one service works**

Check both service statuses:
```bash
sudo systemctl status tap-broadcaster tap-broadcaster-reader2
```

Check logs for errors:
```bash
sudo journalctl -u tap-broadcaster-reader2 -n 50
```

Common issues:
- Device permission: Add user to `dialout` group
- Device conflict: Ensure both services use different devices (USB0 vs USB1)
- Port in use: One service is using the wrong device

**Problem: Taps appear on wrong staff member's screen**

- Verify each staff member selected the correct reader in Settings
- Check localStorage: `localStorage.getItem('nfc_reader_lane')` in browser console
- Verify service is broadcasting with correct lane ID:
  ```bash
  sudo journalctl -u tap-broadcaster -n 1 | grep "lane:"
  ```

**Problem: Taps appear on both screens**

This should not happen with proper lane filtering. Check:
- Each staff member selected different readers in Settings
- WebSocket connection shows correct lane in browser console
- Server is properly filtering by lane (check server.js line 314)

**Problem: Device swap after reboot**

USB device order may change after reboot (USB0 becomes USB1). Solutions:
1. Use consistent USB port assignment (always plug Reader 1 in the same port)
2. Create udev rules to assign persistent device names (advanced)

**Verification:**
```bash
# Check which physical reader is USB0 vs USB1
# Tap card on left reader, check logs:
sudo journalctl -u tap-broadcaster -u tap-broadcaster-reader2 -f
# See which service shows the tap
```

## Systemd Service (Production)

1. **Edit Service File**:

   ```bash
   sudo cp systemd/tap-broadcaster.service /etc/systemd/system/
   sudo nano /etc/systemd/system/tap-broadcaster.service
   ```

   Update:

   ```
   [Service]
   WorkingDirectory=/home/qiss/stuco
   Environment="NEXTJS_URL=http://your-server:3000"
   Environment="NFC_TAP_SECRET=your-secret"
   Environment="POS_LANE_ID=default"
   ExecStart=/home/qiss/stuco/.venv/bin/python /home/qiss/stuco/tap-broadcaster.py
   Restart=always
   User=pi  # Or your user
   ```

2. **Enable and Start**:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable tap-broadcaster
   sudo systemctl start tap-broadcaster
   ```

3. **Status and Logs**:

   ```bash
   sudo systemctl status tap-broadcaster
   journalctl -u tap-broadcaster -f  # Live logs
   journalctl -u tap-broadcaster -n 50  # Last 50 lines
   ```

**Auto-start on Boot**: Enabled.

## Web UI Integration

1. **Start Web UI**:

   ```bash
   cd web-next && pnpm dev
   ```

2. **Test Tap**:

   - Open POS: http://localhost:3000/pos
   - Select "Tap Card" mode.
   - Simulate tap or use hardware.
   - Student auto-selects if enrolled.

3. **Global Taps**:

   - On Dashboard/Students: Tap shows toast "Card Detected! Go to POS".
   - Click: Navigates to POS, auto-selects.

4. **Unenrolled Handling**: See User Guide.

## API Endpoints

### WebSocket /api/nfc/ws

Main WebSocket endpoint for bidirectional communication.

**Connection**: `ws://localhost:3000/api/nfc/ws?lane=default`

**Authentication** (Python broadcaster):
```json
{
  "type": "auth",
  "role": "broadcaster",
  "secret": "your-secret",
  "lane": "default"
}
```

**Authentication** (Browser client):
```json
{
  "type": "auth",
  "role": "client"
}
```
*Note: Browser clients authenticate via session cookie*

**Tap Event** (broadcaster → server):
```json
{
  "type": "tap",
  "card_uid": "DEADBEEF",
  "lane": "default",
  "reader_ts": "2025-11-09T12:00:00Z"
}
```

**Tap Event** (server → clients):
```json
{
  "card_uid": "DEADBEEF",
  "lane": "default",
  "reader_ts": "2025-11-09T12:00:00Z",
  "timestamp": "2025-11-09T12:00:00.123Z"
}
```

**Ping/Pong** (keepalive every 30s):
```json
{"type": "ping"}
{"type": "pong"}
```

### POST /api/nfc/tap (Legacy)

HTTP POST endpoint maintained for backwards compatibility. 
Use WebSocket endpoint for new implementations.

## Troubleshooting

### No Taps Detected

- **Hardware**: Check `lsusb` (USB) or `ls /dev/ttyAMA*` (UART).
- **Permissions**: Add user to dialout/i2c groups.
- **Test**: `nfc-list` (should detect reader).
- **Logs**: Check broadcaster output.

### "Disconnected" in UI

- **WebSocket connection**: Check browser console for WS errors
- **Server running**: Verify Next.js is running on port 3000
- **Secret mismatch**: Check NFC_TAP_SECRET matches in both .env files
- **Network**: Test `curl http://localhost:3000/api/nfc/tap` (GET for health)
- **Broadcaster logs**: Check for `[WS] Authenticated successfully`

### Broadcaster Won't Connect

- **Server URL**: Verify NEXTJS_URL is correct (http://localhost:3000)
- **WebSocket support**: Ensure custom server is running (shows "WebSocket server ready")
- **Firewall**: Check if WebSocket port is blocked
- **Logs**: Look for `[WS] Connection error` or `[WS] Authentication failed`
- **Test mode**: Run `python tap-broadcaster.py --test` to verify connection

### Duplicate Taps

Should be prevented by:
- **Card presence tracking** in Python broadcaster (1.5s debounce)
- **Server-side deduplication** in Next.js (1s debounce)

If still seeing duplicates:
- Check logs for `[TapBroadcaster] Duplicate tap ignored` messages
- Verify `DEBOUNCE_SECONDS` setting in tap-broadcaster.py
- Card may be making poor contact with reader

### Taps Not Auto-Selecting

- Enrolled? Check cards table: `sqlite3 stuco.db "SELECT * FROM cards;"`
- Mode: Ensure "Tap Card" selected in POS.
- Lane: Match ?lane= in URL.
- **WebSocket**: Check browser console shows "Connected" status

### Service Issues

- `systemctl status tap-broadcaster`: Check if running.
- `journalctl -u tap-broadcaster -f`: Live logs.
- Paths: Verify WorkingDirectory, ExecStart in service file.
- **Restart**: `sudo systemctl restart tap-broadcaster`

### Simulation for Testing

Use `--simulate` to test UI without hardware:
```bash
python tap-broadcaster.py --simulate
# Type UIDs like: DEADBEEF
```

### WebSocket Debugging

**Browser console**:
```javascript
// Check WebSocket connection
console.log("WebSocket ready state:", ws.readyState);
// 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
```

**Python broadcaster**:
- Look for `[WS] Connected successfully` and `[WS] Authenticated successfully`
- Connection errors show as `[WS] Connection error:` with details
- Reconnection attempts show backoff timing

**Common WebSocket Errors:**
- "Cannot find module 'ws'": Run `pnpm install` in web-next.
- "Cannot find module './lib/tap-events-node'": Verify file exists.
- Port in use: Kill process `sudo lsof -ti:3000 | xargs kill -9`.

### WebSocket Authentication Troubleshooting

**Problem**: Broadcaster shows "Authentication failed" errors repeatedly.

**Symptoms:**
```
[WS] Broadcaster authentication failed - invalid secret provided
[WS] Connection closed (code: 1008, reason: Authentication failed)
```

**Solutions:**

1. **Verify Secret Configuration**:
   
   The `NFC_TAP_SECRET` must be identical in both locations:
   
   - Web server: `web-next/.env.local`
   - Broadcaster: `.env.broadcaster` (for systemd) or environment variable
   
   ```bash
   # Check web server secret
   grep NFC_TAP_SECRET web-next/.env.local
   
   # Check broadcaster secret
   grep NFC_TAP_SECRET .env.broadcaster
   ```

2. **Generate New Secret** (if needed):
   
   ```bash
   # Generate new secret
   NEW_SECRET=$(openssl rand -hex 32)
   echo $NEW_SECRET
   
   # Add to web-next/.env.local
   echo "NFC_TAP_SECRET=$NEW_SECRET" >> web-next/.env.local
   
   # Add to .env.broadcaster
   echo "NFC_TAP_SECRET=$NEW_SECRET" > .env.broadcaster
   chmod 600 .env.broadcaster
   ```

3. **Restart Services**:
   
   After updating secrets, restart both services:
   ```bash
   # Restart web server
   cd web-next
   pnpm dev  # or restart systemd service
   
   # Restart broadcaster
   sudo systemctl restart tap-broadcaster
   ```

4. **Check Systemd Service Configuration**:
   
   Verify `systemd/tap-broadcaster.service` loads the environment file:
   ```ini
   EnvironmentFile=/home/qiss/stuco/.env.broadcaster
   ```
   
   After editing:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart tap-broadcaster
   ```

5. **Rate Limiting**:
   
   Too many failed auth attempts will trigger rate limiting (5 attempts/minute).
   If rate limited, wait 5 minutes or restart the web server:
   ```bash
   cd web-next
   # Restart development server (Ctrl+C, then pnpm dev)
   ```

6. **Check Logs for Details**:
   
   The enhanced logging shows connection details:
   ```bash
   # Web server logs
   cd web-next
   # Check console output
   
   # Broadcaster logs
   sudo journalctl -u tap-broadcaster -f
   ```
   
   Look for:
   - Connection ID and IP address
   - Masked secrets (first 4 and last 4 chars)
   - Auth attempt count
   - Rate limit warnings

**Security Notes:**
- Never commit `.env.local` or `.env.broadcaster` to version control
- Use strong secrets (32+ hex characters)
- Different secrets for dev/staging/production
- Rotate secrets periodically

## Security (Production)

- **HTTPS**: Configure Next.js SSL.
- **Secret**: Strong, unique (e.g., `openssl rand -hex 32`).
- **Firewall**: Allow only local network to `/api/nfc/*`.
- **Rate Limit**: Limit POSTs to `/api/nfc/tap`.

## Architecture

```
PN532 Reader ─USB/UART─ Raspberry Pi ─WebSocket─ Next.js Server (Custom) ─WebSocket─ Browser (POS)
                          │
                     tap-broadcaster.py
```

## Next Steps

1. Enroll student cards: Students → Add Card.
2. Test full flow: Tap → Select → Charge.
3. Train staff on modes and unenrolled handling.
4. Monitor logs: `journalctl -f`.
5. Backup DB regularly.

See [User Guide](user-guide.md) for workflows, [Troubleshooting](troubleshooting.md) for issues.

**Last updated: November 11, 2025**
