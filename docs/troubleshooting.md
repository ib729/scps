# Troubleshooting

Common issues and solutions for the Stuco system.

## Page Refresh Issues

### Page Refreshes Every 30-40 Seconds (Cloudflare Tunnels)

**Problem**: When accessing the site through Cloudflare Tunnels, the page automatically refreshes every 30-40 seconds, closing dialogs and interrupting work.

**Cause**: Next.js development mode uses WebSocket for Hot Module Replacement (HMR) at `/_next/webpack-hmr`. Cloudflare Tunnels doesn't proxy this WebSocket properly, so Next.js falls back to full page reloads to keep dev experience working.

**Solution**: **Use production mode when accessing through Cloudflare Tunnels:**

```bash
cd /home/qiss/stuco/web-next
pnpm build
pnpm start  # Production mode - no HMR, no refreshes
```

For systemd (permanent fix):
```bash
# The stuco-web.service already uses production mode
sudo systemctl enable stuco-web
sudo systemctl start stuco-web
```

**For local development**: Continue using `pnpm dev` - HMR works fine on localhost.

**Alternative**: Configure Cloudflare Tunnel to support WebSocket for HMR (more complex, not recommended).

## Authentication Issues

### Login/Signup Not Working

**Problem**: Authentication isn't working after initial setup.

**Symptoms**:
- "Invalid credentials" error
- Page redirects to login immediately
- Session not persisting
- Network errors on auth requests

**Solutions**:

1. **Verify Environment Variables**:
   
   Check `web-next/.env.local` contains:
   ```env
   DATABASE_PATH=/absolute/path/to/stuco.db
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   BETTER_AUTH_SECRET=your_generated_secret
   ```

2. **Restart Development Server**:
   
   Environment variables only load on server start:
   ```bash
   # Stop current server (Ctrl+C)
   cd web-next
   pnpm dev
   ```

3. **Check Database Migration**:
   
   Verify Better Auth tables exist:
   ```bash
   sqlite3 stuco.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user', 'session', 'account', 'verification');"
   ```
   
   If tables are missing, run migration:
   ```bash
   cd web-next
   sqlite3 ../stuco.db < migrations/better_auth_schema.sql
   ```

4. **Generate Better Auth Secret**:
   
   If missing or invalid:
   ```bash
   openssl rand -base64 32
   ```
   
   Add to `.env.local`:
   ```env
   BETTER_AUTH_SECRET=generated_secret_here
   ```

5. **Check baseURL Configuration**:
   
   Verify `web-next/lib/auth.ts` has correct baseURL:
   ```typescript
   baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
   ```
   
   And `web-next/lib/auth-client.ts`:
   ```typescript
   baseURL: typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL
   ```

### "Module not found: better-auth"

**Cause**: Dependencies not installed.

**Solution**:
```bash
cd web-next
pnpm install
```

### Session Not Persisting

**Problem**: User is logged out after page refresh.

**Solutions**:

1. **Check Cookies Enabled**: Ensure browser allows cookies for localhost
2. **Verify BETTER_AUTH_SECRET**: Must be set and consistent
3. **Check baseURL**: Must match actual URL (http://localhost:3000)
4. **Browser Console**: Check for CORS or cookie errors in dev tools

### Microsoft OAuth Not Working

**Problem**: Microsoft sign-in button not working or showing errors.

**Solutions**:

1. **Configure Azure AD Credentials**:
   
   Add to `.env.local`:
   ```env
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   ```

2. **Verify Redirect URI**:
   
   In Azure Portal, ensure redirect URI matches:
   - Development: `http://localhost:3000/api/auth/callback/microsoft`
   - Production: `https://your-domain.com/api/auth/callback/microsoft`

3. **Check Azure AD Configuration**:
   - Application must be registered in Azure Portal
   - Client secret must not be expired
   - Redirect URI must be whitelisted

### Signup Code Rejected

**Problem**: Valid signup code is being rejected.

**Solutions**:

1. **Verify Code in Source**:
   
   Check `web-next/app/(auth)/signup/page.tsx`:
   ```typescript
   const SIGNUP_CODE = "12345678"; // Current code
   ```

2. **Check Environment Variable**:
   
   If using env var, verify `.env.local`:
   ```env
   NEXT_PUBLIC_SIGNUP_CODE=your_code
   ```

3. **Restart Server**: After changing code, restart dev server

4. **No Spaces**: Ensure code has no leading/trailing spaces

### "CORS error" or "Origin not allowed"

**Solutions**:

1. **Verify NEXT_PUBLIC_APP_URL**: Must match actual URL
2. **Check trustedOrigins**: In `web-next/lib/auth.ts`
3. **Browser Console**: Check exact error message

### "Database error" or "Table not found"

**Solutions**:

1. **Run Migration**: See [Authentication Guide](authentication.md#database-setup)
2. **Check DATABASE_PATH**: Must be absolute path
3. **Verify Permissions**: Database file must be readable/writable

### Testing Authentication

After setup, verify authentication works:

1. Navigate to `http://localhost:3000`
2. Should redirect to `/login`
3. Click "Sign up" to create account
4. Fill in name, email, password
5. Enter signup code (default: `12345678`)
6. Should auto-login and redirect to `/dashboard`

**Success Indicators**:
- ✅ No errors in browser console
- ✅ POST request to `/api/auth/sign-up/email` returns 200
- ✅ Automatic redirect to `/dashboard` after signup
- ✅ User name appears in sidebar
- ✅ Logout works and redirects to `/login`

**Debugging Tips**:

1. **Browser Console** (F12): Check for JavaScript errors
2. **Network Tab** (F12): Monitor API requests to `/api/auth/*`
3. **Server Logs**: Check terminal where `pnpm dev` is running
4. **Database Inspection**:
   ```bash
   sqlite3 stuco.db "SELECT * FROM user;"
   sqlite3 stuco.db "SELECT * FROM session;"
   ```

## Web UI Issues

### "Could not locate the bindings file" (better-sqlite3)

**Cause**: Native module not compiled for your platform.

**Solutions**:
1. Run `./check-prereqs.sh` in `web-next/` to verify tools.
2. Reinstall: `rm -rf node_modules && pnpm install`.
3. Approve builds: `pnpm approve-builds better-sqlite3`.
4. Manual rebuild: `pnpm rebuild better-sqlite3`.
5. Legacy: `./setup.sh`.

**Raspberry Pi Specific**:
- Increase swap: See Getting Started prerequisites.
- Use 64-bit OS.

### Database Connection Failed

**Cause**: Wrong path or permissions.

**Solutions**:
1. Check `.env.local`: `DATABASE_PATH=/absolute/path/to/stuco.db`.
2. Verify file: `ls -l stuco.db` (readable/writable).
3. Test: `cd web-next && node test-db.js`.
4. Permissions: `chmod 666 stuco.db`.

### "500 Internal Server Error" on Pages

**Cause**: DB query error or env missing.

**Solutions**:
1. Check browser console/server logs.
2. Ensure DB initialized: `python init_db.py`.
3. Run migrations if schema outdated.
4. Restart: `pnpm dev`.

### Port 3000 in Use

**Solution**: `pnpm dev -- -p 3001` (use 3001).

## Database Issues

### Database Locked / Busy

**Cause**: Concurrent writes (CLI + web).

**Solutions**:
1. Close other connections (stop pos.py, sqlite3 CLI).
2. Enable WAL: `sqlite3 stuco.db "PRAGMA journal_mode=WAL;"`
3. Increase timeout in code (busy_timeout=5000).
4. Restart apps.

### Foreign Key Constraint Error

**Cause**: Deleting with related data pre-migration.

**Solution**: Run cascade migration: `./scripts/run_migration.sh migrate_cascade_delete.sql`.

### Data Not Updating

**Cause**: Cache or transaction rollback.

**Solutions**:
1. Refresh page (Ctrl+F5).
2. Check revalidation in actions.
3. Verify commit in code.
4. Query DB directly: `sqlite3 stuco.db "SELECT * FROM transactions;"`.

## NFC Issues

### No Card Detection

**Cause**: Hardware/connection.

**Solutions**:
1. Check device: `lsusb` (USB) or `ls /dev/ttyAMA*` (UART).
2. Test CLI: `nfc-list` (libnfc) or `python tap-broadcaster.py --device <dev>`.
3. Permissions: `sudo usermod -aG dialout,i2c $USER` (relogin).
4. Wiring: Verify PN532 pins (UART: TX/RX/GND/3.3V).

### "Disconnected from reader" in UI

**Cause**: SSE not connecting.

**Solutions**:
1. Verify web UI running: `curl http://localhost:3000/api/nfc/stream`.
2. Check secrets match: NFC_TAP_SECRET in envs.
3. Browser: Dev tools > Network > WS/SSE tab.
4. Restart broadcaster: `systemctl restart tap-broadcaster`.

### Taps Not Auto-Selecting

**Cause**: Enrollment or mode.

**Solutions**:
1. Check card enrolled: `sqlite3 stuco.db "SELECT * FROM cards WHERE card_uid='UID';"`
2. POS mode: Select "Tap Card".
3. Lane: Match ?lane= in URL.
4. Enrolled but wrong student: Revoke duplicates.

### Broadcaster Not Broadcasting

**Cause**: Network or auth.

**Solutions**:
1. Logs: `journalctl -u tap-broadcaster -f`.
2. Test: `python tap-broadcaster.py --test`.
3. URL: Verify NEXTJS_URL reachable.
4. Secret: Matches web UI.

### Service Won't Start

**Solutions**:
1. `systemctl status tap-broadcaster`: Check errors.
2. Paths: Verify WorkingDirectory, ExecStart in service file.
3. Dependencies: Activate venv in ExecStart.
4. Reload: `systemctl daemon-reload`.

### NFC Reader Stops Working After Dev Server Restart

**Problem**: PN532 NFC reader stops detecting cards after restarting dev server or making code changes.

**Symptoms**:
- Reader was working, then suddenly stops
- Broadcaster logs show connection but no card reads
- Device appears busy or locked
- Requires systemd restart or reboot

**Cause**: Serial port file descriptor not properly released by nfcpy library when WebSocket disconnects or exceptions occur.

**Automatic Recovery**: The system now includes auto-recovery mechanisms:
- USB device auto-reset on service start (systemd `ExecStartPre`)
- Health monitoring with automatic reset after consecutive failures
- Proper cleanup handlers on shutdown

**Manual Recovery** (if auto-recovery fails):

1. **Quick Recovery** (recommended):
   ```bash
   ./scripts/recover-nfc.sh
   ```
   This script stops the broadcaster, kills processes, resets USB, and restarts.

2. **Step-by-step**:
   ```bash
   # Stop broadcaster
   sudo systemctl stop tap-broadcaster
   
   # Kill any stale processes
   sudo pkill -f tap-broadcaster.py
   
   # Reset USB device
   ./scripts/reset-usb-nfc.sh
   
   # Wait for device to stabilize
   sleep 3
   
   # Start broadcaster
   sudo systemctl start tap-broadcaster
   ```

3. **Check recovery status**:
   ```bash
   sudo systemctl status tap-broadcaster
   sudo journalctl -u tap-broadcaster -n 20
   ```

**Prevention**: For development with NFC, use the coordinated startup script:
```bash
./scripts/dev-with-nfc.sh
```

This script:
- Stops broadcaster safely
- Resets USB device
- Starts dev server
- Starts broadcaster after server is ready
- Coordinates cleanup properly

**Available Scripts**:
- `./scripts/reset-usb-nfc.sh` - Reset USB device only
- `./scripts/recover-nfc.sh` - Full emergency recovery
- `./scripts/dev-with-nfc.sh` - Start dev environment with NFC
- `./run-nfc.sh` - Manual broadcaster start (development)

## CLI Issues

### pos.py: "Unknown/inactive card"

**Solution**: Enroll card: `python enroll.py` or web UI.

### topup.py: Float Errors

**Solution**: Update to decimal support (post-migration).

### NFC Import Error

**Solution**: `pip install nfcpy` or `sudo apt install libnfc-bin` (I2C).

## General

### Balances Wrong

1. Check transactions: Filter ADJUST/TOPUP.
2. Manual adjust: Top-up with negative + reason.
3. Verify migration ran (decimals).

### Overdraft Not Resetting

**Cause**: Week calculation (Asia/Shanghai).

**Solution**: Manual reset in DB or wait for Monday 00:00 UTC+8.

### UI Slow on Pi

**Solutions**:
- Use Pi 4B 8GB.
- Close other processes.
- Production build: `pnpm build && pnpm start`.

### Linter/TS Errors

**Solution**: `pnpm lint --fix` or `pnpm build` (catches TS).

For persistent issues, check logs, git revert, or ask for help.

See specific guides for more details.

**Last updated: November 11, 2025**
