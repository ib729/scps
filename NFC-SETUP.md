# NFC Card Tap Integration - Quick Start Guide

This guide will help you set up the NFC card tap integration for the Stuco POS system.

## Overview

The NFC tap integration enables a tap-based workflow **for POS only**:
1. Student taps their card on the PN532 reader
2. The POS page automatically selects the student
3. Staff enters the purchase amount
4. Transaction is processed with the card UID logged

**Note:** Top-up operations use manual student selection only.

## What You Need

- Raspberry Pi 4B (already set up)
- PN532 NFC reader (connected via UART/USB)
- Next.js web UI running (`web-next/`)
- Python environment with `nfcpy` and `requests`

## Quick Setup (5 Minutes)

### 1. Install Python Dependencies

```bash
cd /path/to/stuco
source .venv/bin/activate
pip install -r requirements.txt
```

This installs the `requests` library needed for HTTP communication.

### 2. Test Without Hardware

First, test the system in simulation mode:

```bash
# Terminal 1: Start Next.js
cd web-next
pnpm dev

# Terminal 2: Start tap broadcaster (simulation mode)
cd ..
python tap-broadcaster.py --simulate
```

In the simulation terminal, type a test card UID:
```
> DEADBEEF
```

You should see:
- `[OK] Tap broadcast: DEADBEEF → X listener(s)` in the broadcaster
- The POS page auto-selects a student if the card is registered

### 3. Set Up Environment Variables

Create a `.env` file in the project root or set environment variables:

```bash
export NEXTJS_URL=http://localhost:3000
export NFC_TAP_SECRET=your-secret-change-this
export POS_LANE_ID=default
```

Update `web-next/.env.local` to match:

```bash
DATABASE_PATH=/full/path/to/stuco.db
NFC_TAP_SECRET=your-secret-change-this
```

**Important:** Use the same secret in both places!

### 4. Test With Hardware

```bash
python tap-broadcaster.py --device tty:AMA0:pn532
```

Tap a card on the reader. You should see:
- `[NFC] Waiting for card tap on tty:AMA0:pn532...`
- When tapped: `[OK] Tap broadcast: <UID> → X listener(s)`

Open the POS page in a browser and tap a registered card. The student should auto-select.

## Running Permanently (Systemd Service)

### 1. Edit the Service File

```bash
sudo nano tap-broadcaster.service
```

Update these lines:
```ini
WorkingDirectory=/home/pi/stuco
Environment="NEXTJS_URL=http://localhost:3000"
Environment="NFC_TAP_SECRET=your-actual-secret-here"
ExecStart=/home/pi/stuco/.venv/bin/python /home/pi/stuco/tap-broadcaster.py
```

### 2. Install and Start the Service

```bash
sudo cp tap-broadcaster.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tap-broadcaster
sudo systemctl start tap-broadcaster
```

### 3. Check It's Running

```bash
sudo systemctl status tap-broadcaster
```

You should see `Active: active (running)`.

### 4. View Logs

```bash
# Follow logs in real-time
journalctl -u tap-broadcaster -f

# Last 50 lines
journalctl -u tap-broadcaster -n 50
```

## Using the POS System

### Tap Card Mode (Recommended)

1. Open the POS page: `http://localhost:3000/pos`
2. Ensure "Tap Card" mode is selected
3. Student taps their card
4. UI auto-selects the student and shows their balance
5. Staff enters the purchase amount (e.g., ¥6)
6. Click "Charge ¥6"
7. Done! Transaction logged with card UID

### Manual Mode

1. Click "Manual" button to disable NFC listening
2. Staff selects student from dropdown
3. Staff enters the amount
4. Click "Charge ¥X"
5. Transaction created (no card UID)

**Use manual mode when:** Reader is offline, student forgot card, or for testing.

## Troubleshooting

### "Disconnected from reader" in browser

**Cause:** SSE stream not connecting

**Fix:**
- Ensure Next.js is running: `cd web-next && pnpm dev`
- Check the stream endpoint: `curl http://localhost:3000/api/nfc/stream`

### Tap events not appearing

**Cause:** Broadcaster not running or wrong URL

**Fix:**
```bash
# Check broadcaster status
sudo systemctl status tap-broadcaster

# Test manually
python tap-broadcaster.py --test

# Check Next.js logs for POST requests
# Should see: POST /api/nfc/tap 200
```

### Card not recognized

**Cause:** Card not enrolled or revoked

**Fix:**
1. Go to Students page
2. Click on the student
3. Add their card UID
4. Ensure status is "active"

### Wrong student selected

**Cause:** Multiple students have the same card (shouldn't happen)

**Fix:**
- Check database: `SELECT * FROM cards WHERE card_uid = 'THE_UID';`
- Cards are unique per student

## Security Notes

### For Development (localhost)

- Using HTTP is fine
- Secret is optional but recommended

### For Production (network/internet)

1. **Use HTTPS:** Configure Next.js with SSL certificates
2. **Strong secret:** Generate with `openssl rand -hex 32`
3. **Firewall:** Only allow tap broadcaster to reach `/api/nfc/tap`
4. **Rate limiting:** Add middleware to limit POST requests

## Multiple POS Lanes

If you have multiple checkout stations:

### Broadcaster 1 (Lane A)
```bash
POS_LANE_ID=lane-a python tap-broadcaster.py --device tty:USB0:pn532
```

### Broadcaster 2 (Lane B)
```bash
POS_LANE_ID=lane-b python tap-broadcaster.py --device tty:USB1:pn532
```

### Browser
Open POS pages with lane query parameter:
- Lane A: `http://localhost:3000/pos?lane=lane-a`
- Lane B: `http://localhost:3000/pos?lane=lane-b`

Currently, all lanes share the stream. Future: add lane filtering in the UI.

## Testing Checklist

- [ ] Python dependencies installed (`requests` available)
- [ ] Simulation mode works (`python tap-broadcaster.py --simulate`)
- [ ] Hardware mode detects cards
- [ ] Secrets match in both `.env` files
- [ ] Browser shows "Connected to card reader" status
- [ ] Tapping a registered card auto-selects the student
- [ ] Transaction completes and logs card UID
- [ ] Systemd service starts on boot
- [ ] Logs are clean (`journalctl -u tap-broadcaster`)

## Next Steps

Once the tap integration is working:

1. **Enroll all student cards:** Students → Add Card
2. **Train staff:** Show them both tap-first and amount-first modes
3. **Monitor logs:** Check for errors daily
4. **Backup database:** Regular backups of `stuco.db`

## Getting Help

Common issues and their fixes:

| Problem | Solution |
|---------|----------|
| Card reader not found | Check USB/UART connection, run `lsusb` |
| Permission denied | Add user to `dialout` group: `sudo usermod -aG dialout $USER` |
| Events lag or delay | Check network latency, use wired connection |
| Service won't start | Check paths in service file, view `journalctl` |

## Architecture Diagram

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  PN532 NFC  │──USB─│  Raspberry   │──HTTP─│   Next.js   │
│   Reader    │      │     Pi       │  POST │   Server    │
└─────────────┘      │              │      └─────────────┘
                     │ tap-broad-   │            │
                     │ caster.py    │            │ SSE
                     └──────────────┘            ▼
                                          ┌─────────────┐
                                          │   Browser   │
                                          │  (POS UI)   │
                                          └─────────────┘
```

Tap → Python reads UID → POST to Next.js → Broadcast to browsers → UI updates

## License

Part of the Stuco Snack Bar management system.

