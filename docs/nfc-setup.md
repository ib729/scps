# NFC Card Tap Integration

This guide sets up NFC tap support for the Stuco POS system, enabling card taps to auto-select students in the web UI.

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
python tap-broadcaster.py --device usb:001:003     # USB (check lsusb)
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
║         NFC Tap Broadcaster for Stuco POS System             ║
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
- **WebSocket support**: Ensure Next.js version supports WebSockets
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
- Lane: Match POS URL query param.
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

## Security (Production)

- **HTTPS**: Configure Next.js SSL.
- **Secret**: Strong, unique (e.g., `openssl rand -hex 32`).
- **Firewall**: Allow only local network to `/api/nfc/*`.
- **Rate Limit**: Limit POSTs to `/api/nfc/tap`.

## Architecture

```
PN532 Reader ─USB/UART─ Raspberry Pi ─HTTP POST─ Next.js Server ─SSE─ Browser (POS)
                          │
                     tap-broadcaster.py
```

## Next Steps

1. Enroll student cards: Students → Add Card.
2. Test full flow: Tap → Select → Charge.
3. Train staff on modes and unenrolled handling.
4. Monitor logs: `journalctl -f`.
5. Backup DB regularly.

## Architecture & Implementation

### System Components

```
┌──────────────┐   USB/UART   ┌─────────────────┐   HTTP POST   ┌──────────────┐
│  PN532 NFC   │─────────────▶│  Raspberry Pi   │──────────────▶│  Next.js     │
│   Reader     │              │  tap-broad-     │               │  /api/nfc/   │
└──────────────┘              │  caster.py      │               │  tap         │
                              └─────────────────┘               └──────┬───────┘
                                                                       │
                                                                       │ Broadcast
                                                                       ▼
                              ┌─────────────────┐   SSE Stream  ┌──────────────┐
                              │   POS Browser   │◀──────────────│  Next.js     │
                              │   (Client)      │               │  /api/nfc/   │
                              └─────────────────┘               │  stream      │
                                                                └──────────────┘
```

### Backend Components

**Event Backbone (`lib/tap-events.ts`):**
- In-memory event broadcaster using TypeScript
- Manages SSE subscribers with thread-safe listener management
- Broadcasts tap events to all connected clients

**API Endpoints:**
- `/api/nfc/tap` - POST endpoint receiving tap events from Python broadcaster
- `/api/nfc/stream` - Server-Sent Events (SSE) endpoint for real-time tap streaming
- Validates shared secret for authentication
- 30-second keepalive to maintain connection

**Server Actions (`app/actions/pos.ts`):**
- Accepts either `student_id` or `card_uid`
- Auto-resolves student from card UID
- Validates card status (active/revoked)
- Logs card UID with every transaction

### Performance Metrics

- SSE Latency: <50ms (local network)
- Tap-to-UI: ~500ms (including card lookup)
- Database Queries: <10ms (SQLite is local)
- Concurrent Users: 50+ browsers (SSE scales well)

See [User Guide](user-guide.md) for workflows, [Troubleshooting](troubleshooting.md) for issues.

**Updated**: November 2025 (Consolidated NFC Documentation)
