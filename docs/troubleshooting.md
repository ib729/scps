# Troubleshooting

Common issues and solutions for the Stuco system.

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

**Solution**: Run cascade migration: `./run_migration.sh migrate_cascade_delete.sql`.

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

**Updated**: November 2025
