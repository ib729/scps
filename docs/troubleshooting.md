# Troubleshooting

Common issues and solutions for the Student Council Payment System.

## Page Refresh Issues

### Page Refreshes Every 30-40 Seconds (Cloudflare Tunnels)

**Problem**: When accessing the site through Cloudflare Tunnels, the page automatically refreshes every 30-40 seconds, closing dialogs and interrupting work.

**Cause**: Next.js development mode uses WebSocket for Hot Module Replacement (HMR) at `/_next/webpack-hmr`. Cloudflare Tunnels doesn't proxy this WebSocket properly, so Next.js falls back to full page reloads to keep dev experience working.

**Solution**: **Use production mode when accessing through Cloudflare Tunnels:**

```bash
cd $PROJECT_ROOT/web-next
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

1. **Check Environment Variable**:
   
   Verify the `SIGNUP_CODE` is set in `web-next/.env.local`:
   ```env
   SIGNUP_CODE=your_code_here
   ```
   
   Note: Do NOT use quotes around the value (use `SIGNUP_CODE=abc123` not `SIGNUP_CODE="abc123"`)

2. **Restart Server**: After changing `.env.local`, restart the server:
   ```bash
   cd web-next
   # Stop the server (Ctrl+C), then:
   pnpm dev
   # Or in production:
   sudo systemctl restart stuco-web
   ```

3. **Verify Code Has No Spaces**: Ensure the code has no leading/trailing spaces

4. **Check Server Logs**: Look for "SIGNUP_CODE environment variable is not set" errors

### "CORS error" or "Origin not allowed"

**Solutions**:

1. **Verify NEXT_PUBLIC_APP_URL**: Must match actual URL
2. **Check trustedOrigins**: In `web-next/lib/auth.ts`
3. **Browser Console**: Check exact error message

### "Failed to sign up" Error

**Problem**: Signup code is accepted but account creation fails.

**Cause**: Better Auth database tables are missing (usually after a database reset).

**Solution**:

Since v2.0+, Better Auth tables are automatically created by `init_db.py` and reset scripts. If you're using an older database or manually reset it, run:

```bash
cd web-next
sqlite3 ../stuco.db < migrations/better_auth_schema.sql
sudo systemctl restart stuco-web
```

**Verify tables exist**:
```bash
sqlite3 stuco.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user', 'session', 'account', 'verification');"
```

Should return all 4 table names.

### "Database error" or "Table not found"

**Solutions**:

1. **Check Better Auth Tables**: Run the verification command above to ensure auth tables exist
2. **Run Database Init**: If starting fresh, use `python init_db.py` (automatically includes Better Auth tables)
3. **Check DATABASE_PATH**: Must be absolute path in `.env.local`
4. **Verify Permissions**: Database file must be readable/writable by the web server user

### Testing Authentication

After setup, verify authentication works:

1. Navigate to `http://localhost:3000`
2. Should redirect to `/login`
3. Click "Sign up" to create account
4. Fill in name, email, password
5. Enter signup code
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
1. Run `./scripts/web-next-check-prereqs.sh` to verify tools.
2. Reinstall: `cd web-next && rm -rf node_modules && pnpm install`.
3. Approve builds: `cd web-next && pnpm approve-builds better-sqlite3`.
4. Manual rebuild: `cd web-next && pnpm rebuild better-sqlite3`.
5. Legacy: `./scripts/web-next-setup.sh`.

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

**Cause**: WebSocket connection failed.

**Solutions**:
1. Verify web UI running: `curl http://localhost:3000/api/nfc/tap`.
2. Check secrets match: NFC_TAP_SECRET in envs.
3. Browser: Dev tools > Console > Check for WebSocket errors.
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

### NFC Reader Stops Working After Idle Period

**Problem**: NFC reader stops detecting cards after sitting idle for a while, requiring manual intervention.

**Symptoms**:
- Reader works initially, then stops after being idle
- No cards detected even when tapped
- Requires running fix-readers.sh to recover
- Staff reports "scanner stopped working"

**Root Causes**:
1. **USB Autosuspend**: OS puts USB devices to sleep to save power
2. **Hardware Lockup**: Device becomes unresponsive and needs reset
3. **Driver Issues**: USB serial driver loses connection

**Solution - Multi-Layer Auto-Recovery**:

The system now includes three layers of automatic recovery that should prevent this issue:

#### Layer 1: OS-Level (USB Autosuspend Disabled)

**Configuration**: `/boot/firmware/cmdline.txt` includes `usbcore.autosuspend=-1`

**Verification**:
```bash
cat /sys/module/usbcore/parameters/autosuspend
# Should show: -1
```

If not disabled, the parameter was added but system needs reboot:
```bash
sudo reboot
```

#### Layer 2: Hardware Reconnection Logic

**How it works**: Tap broadcaster automatically detects hardware failures and reconnects.

**What it does**:
- Monitors for consecutive read failures
- Detects timeouts, disconnections, and lockups
- Automatically reinitializes hardware connection
- Uses exponential backoff (1s → 2s → 5s → 10s → 30s max)
- Continues indefinitely until hardware is available

**Check if it's working**:
```bash
# View live logs:
sudo journalctl -u tap-broadcaster -f

# Look for these messages (indicates automatic recovery):
# [NFC] Hardware connection lost: ...
# [NFC] Attempting hardware reconnection #N in Xs...
# [NFC] Hardware reconnection successful! Resuming reader loop...
```

**Simulate hardware failure** (for testing):
```bash
# Unplug USB reader while logs are running
# Should see automatic reconnection messages
# Replug USB reader
# Should see "Hardware reconnection successful!"
```

#### Layer 3: Service Auto-Restart

**Configuration**: Systemd service has `Restart=always`

**Check if enabled**:
```bash
sudo systemctl show tap-broadcaster -p Restart
# Should show: Restart=always
```

**How it works**: If broadcaster process crashes completely, systemd automatically restarts it.

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
- Hardware reconnection logic (see above section)

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
- `./scripts/run-nfc.sh` - Manual broadcaster start (development)

### Troubleshooting Auto-Recovery

**If auto-recovery doesn't seem to be working:**

1. **Check if USB autosuspend is actually disabled**:
   ```bash
   cat /sys/module/usbcore/parameters/autosuspend
   # Must show: -1
   # If it shows something else, reboot is needed after editing cmdline.txt
   ```

2. **Verify tap-broadcaster.py has latest code**:
   ```bash
   grep -n "nfc_reader_loop_with_reconnection" /home/qiss/scps/tap-broadcaster.py
   # Should find the function (means auto-reconnection is implemented)
   ```

3. **Check logs for recovery attempts**:
   ```bash
   sudo journalctl -u tap-broadcaster --since "1 hour ago" | grep -i "reconnection\|hardware"
   ```

4. **Test hardware manually**:
   ```bash
   # Stop the service temporarily:
   sudo systemctl stop tap-broadcaster tap-broadcaster-reader2
   
   # Test hardware directly:
   nfc-list
   # Should detect the reader
   
   # If nfc-list works, restart services:
   sudo systemctl start tap-broadcaster tap-broadcaster-reader2
   ```

5. **Check for persistent hardware issues**:
   ```bash
   # View USB errors:
   dmesg | grep -i "usb\|ttyUSB" | tail -20
   
   # If you see lots of errors, the USB cable or reader itself may be faulty
   ```

**When to manually intervene**:

The auto-recovery should handle 99% of issues. Only manually intervene if:
- Logs show recovery attempts failing repeatedly for >30 minutes
- Hardware test (`nfc-list`) fails completely
- USB device not showing up at all (`ls /dev/ttyUSB*` shows nothing)
- System logs show hardware errors (`dmesg | grep -i error`)

In these cases, use the fix-readers.sh script or check physical connections.

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
