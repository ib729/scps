# WebSocket Setup Instructions (Self-Hosted)

Since you're self-hosting on Node.js (not Deno/Vercel), I've created a custom server setup for WebSocket support.

## What I've Done

1. **Created custom server** (`web-next/server.js`):
   - Node.js HTTP server with WebSocket support
   - Handles both Next.js requests and WebSocket connections
   - Uses the `ws` package for WebSocket functionality

2. **Created Node.js-compatible broadcaster** (`web-next/lib/tap-events-node.js`):
   - CommonJS version that works with the custom server
   - Same deduplication logic as the TypeScript version

3. **Updated package.json**:
   - Added `ws` package dependency
   - Changed `dev` script to use custom server
   - Changed `start` script for production

4. **Removed Deno-specific route**:
   - Deleted `web-next/app/api/nfc/ws/route.ts` (won't work on Node.js)

## Setup Steps

### 1. Install WebSocket Package

```bash
cd /home/qiss/stuco/web-next
pnpm install ws@^8.18.0
```

### 2. Install Python WebSocket Library

```bash
cd /home/qiss/stuco
source .venv/bin/activate
pip install websockets==13.1
```

### 3. Start the Server

**Development:**
```bash
cd /home/qiss/stuco/web-next
pnpm dev
```

This now runs the custom server with WebSocket support!

**Production:**
```bash
cd /home/qiss/stuco/web-next
pnpm build
pnpm start
```

### 4. Test the Setup

**Terminal 1** - Start Next.js:
```bash
cd /home/qiss/stuco/web-next
pnpm dev
```

You should see:
```
> Ready on http://localhost:3000
> WebSocket server ready on ws://localhost:3000/api/nfc/ws
```

**Terminal 2** - Test Python broadcaster:
```bash
cd /home/qiss/stuco
source .venv/bin/activate
python tap-broadcaster.py --test --secret your-secret
```

You should see:
```
[WS] Connecting to ws://localhost:3000/api/nfc/ws...
[WS] Connected successfully
[WS] Authenticated successfully (lane: default)
[TEST] Test tap sent successfully
```

### 5. Update Systemd Service (if used)

If you're using systemd for the Next.js app, update the ExecStart to use the custom server:

```bash
# Your Next.js service file should use:
ExecStart=/usr/bin/node /home/qiss/stuco/web-next/server.js

# Or with npm/pnpm:
ExecStart=/usr/bin/pnpm start
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Custom Node.js Server                     │
│                      (server.js)                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │   Next.js App    │         │  WebSocket Server│          │
│  │   (HTTP Routes)  │         │   (/api/nfc/ws)  │          │
│  └──────────────────┘         └──────────────────┘          │
│                                        │                      │
│                                        ▼                      │
│                             ┌────────────────────┐           │
│                             │  Tap Broadcaster   │           │
│                             │  (tap-events-node) │           │
│                             └────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                    │                           │
                    │                           │
         ┌──────────┴────────┐       ┌─────────┴────────┐
         │  Browser Clients  │       │ Python Broadcaster│
         │    (WebSocket)    │       │    (WebSocket)    │
         └───────────────────┘       └──────────────────┘
```

## Verification Checklist

After setup, verify:

- [ ] `pnpm dev` shows WebSocket server ready message
- [ ] Python test mode connects successfully
- [ ] Browser console shows WebSocket connection when visiting `/pos`
- [ ] Simulation mode works: `python tap-broadcaster.py --simulate --secret your-secret`

## Troubleshooting

### "Cannot find module 'ws'"
```bash
cd web-next
pnpm install
```

### "Cannot find module './lib/tap-events-node'"
Make sure the file exists at `web-next/lib/tap-events-node.js`

### Port already in use
```bash
# Kill existing process on port 3000
sudo lsof -ti:3000 | xargs kill -9
```

### WebSocket connection refused
- Ensure the custom server is running (not `next dev`)
- Check the server output shows "WebSocket server ready"
- Verify port 3000 is accessible

## What's Different from Standard Next.js?

**Standard Next.js:**
- Uses `next dev` or `next start`
- No WebSocket support on Node.js runtime

**Our Custom Setup:**
- Uses custom server (`node server.js`)
- Adds WebSocket support via `ws` package
- Maintains all Next.js functionality
- Slightly different startup command

## Production Deployment

For production on your Raspberry Pi:

1. Build the Next.js app:
   ```bash
   cd web-next
   pnpm build
   ```

2. Create systemd service for Next.js (if not already):
   ```bash
   sudo nano /etc/systemd/system/stuco-web.service
   ```

   ```ini
   [Unit]
   Description=Stuco Web Server with WebSocket
   After=network.target

   [Service]
   Type=simple
   User=qiss
   WorkingDirectory=/home/qiss/stuco/web-next
   Environment="NODE_ENV=production"
   Environment="PORT=3000"
   ExecStart=/usr/bin/node /home/qiss/stuco/web-next/server.js
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable stuco-web
   sudo systemctl start stuco-web
   ```

That's it! Your self-hosted setup will now have full WebSocket support. 🎉

