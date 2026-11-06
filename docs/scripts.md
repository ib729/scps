# Scripts Reference

Documentation for all utility scripts in the Student Council Payment System, including setup, maintenance, and testing tools.

## Overview

The Student Council Payment System includes various scripts for:
- **Setup**: Installing dependencies and configuring the environment
- **Database**: Initialization, migration, backup, and reset
- **NFC**: Testing and broadcasting card taps
- **Student Management**: Enrollment and batch imports
- **Maintenance**: Checking prerequisites and troubleshooting

---

## Unified Administrative CLI

We have consolidated administrative tasks (user management, ledger adjustments, imports, and system diagnostics) into a unified TypeScript CLI. This replaces individual standalone Python scripts for production management.

### scps-cli

**Location**: `./scps-cli` (root)

**Purpose**: Terminal interface for staff accounts, ledger adjustments, imports, and diagnostics. Initialize the database first using [Getting Started](getting-started.md).

**Usage:**

*   **Interactive Menu Mode:** (Run with no arguments to open the visual console menu)
    ```bash
    ./scps-cli
    ```
*   **Direct Commands (still interactive):**
    ```bash
    ./scps-cli users             # Manage staff accounts (Add, Delete, Reset Password)
    ./scps-cli ledger            # Execute top-ups and balance debits
    ./scps-cli import            # Parse and import students/cards from a CSV file
    ./scps-cli import-db         # Overwrite active database securely from backup
    ./scps-cli diagnose          # Spawns serial, reader, and GPIO test scripts
    ```

The launcher runs from `web-next/`, so relative CSV and backup paths resolve there. Ledger debits are administrative adjustments; they do not enforce the web POS weekly overdraft policy.

Before `import-db`, stop the app and other database writers and keep a separate backup. Restore accepts only integrity-checked, current-schema databases; initialize or migrate legacy backups on a copy first. SQLite performs the replacement transactionally without deleting active WAL files.

**Interactive Interface Preview:**
```
┌  SCPS CLI
│
◇  What management task would you like to perform?
│  ● Manage Staff Accounts (Add, Delete, Reset Passwords)
│  ○ Ledger & Balances (Top-up, Adjustments)
│  ○ Import Students (CSV)
│  ○ Import SQLite Database Backup (Overwrite Active)
│  ○ NFC Hardware & Diagnostics
│  ○ Exit CLI
└
```

---

### scps-remote-cli

**Location**: `./scps-remote-cli` (root)

**Purpose**: Secure SSH connection wrapper to interactively run the remote production server's CLI from your local terminal.

**Prerequisites:**

Configure your production server credentials in your local `web-next/.env.local` configuration file:
```bash
SCPS_VPS_HOST=157.180.68.183              # Remote server IP
SCPS_VPS_USER=root                         # SSH user
SCPS_VPS_DIR=/home/qiss/scps               # Repo directory path on VPS
SCPS_VPS_PORT=22                          # SSH port (default: 22)
SCPS_VPS_SSH_KEY=~/.ssh/id_ed25519         # Optional path to private key
```

**Usage:**

Run the script locally to allocate a secure pseudo-terminal TTY session (`ssh -t`) to the VPS:
```bash
./scps-remote-cli [command]
```

This establishes an encrypted connection, navigates to the target repository directory, and initializes `./scps-cli` in your current terminal session cleanly.

---

## Setup Scripts

### web-next-check-prereqs.sh

**Location**: `scripts/web-next-check-prereqs.sh`

**Purpose**: Verify build tools and dependencies before installing.

**Usage:**
```bash
./scripts/web-next-check-prereqs.sh
```

**Checks:**
- Operating system (Linux)
- gcc, g++, make (Linux)
- Node.js and version
- pnpm package manager
- python3

**Output:**
- ✅ Green checks for installed tools
- ❌ Red X for missing dependencies
- Installation instructions for missing tools

**Exit Codes:**
- `0`: All prerequisites met
- `1`: Missing dependencies

**When to Use:**
- Before first `pnpm install`
- After OS upgrade or toolchain changes
- When troubleshooting build failures

### web-next-setup.sh

**Location**: `scripts/web-next-setup.sh`

**Purpose**: Legacy manual setup for better-sqlite3 when postinstall fails.

**Usage:**
```bash
./scripts/web-next-setup.sh
```

**Steps:**
1. Changes to `web-next/` directory
2. Runs `pnpm install` to install dependencies
3. Navigates to better-sqlite3 directory
4. Manually builds native bindings with `npm run build-release`
5. Returns to project root

**When to Use:**
- If `pnpm install` postinstall hook fails
- On platforms with complex build requirements
- When `web-next-check-prereqs.sh` passes but postinstall still fails

**Note**: Modern `pnpm install` includes automatic postinstall, so this is rarely needed.

### setup-debian.sh

**Location**: `scripts/setup-debian.sh`

**Purpose**: Bootstrap a Debian VPS for the SCPS web app with systemd.

**Usage:**
```bash
./scripts/setup-debian.sh
```

**What it does:**
1. Verifies a Debian-based host with `sudo`
2. Installs OS packages, Node.js 20, `pnpm`, `rclone`, `sqlite3`, `zstd`, and Python tooling
3. Creates `.venv` and installs root Python dependencies
4. Installs `web-next` dependencies and builds the app
5. Creates `web-next/.env.local` from `web-next/.env.local.example` if missing
6. Renders and installs `stuco-web.service`
7. Enables and starts the production web service

**When to Use:**
- First-time VPS setup
- Reprovisioning a Debian host
- Standardizing production installs

### deploy-vps.sh

**Location**: `scripts/deploy-vps.sh`

**Purpose**: Pull the latest code on the VPS and restart the production web service.

**Usage:**
```bash
./scripts/deploy-vps.sh
./scripts/deploy-vps.sh main
```

**What it does:**
1. Fails if the VPS repo is dirty
2. Fetches from `origin`
3. Fast-forward pulls the selected branch
4. Runs `pnpm install --frozen-lockfile`
5. Runs `pnpm build`
6. Restarts `stuco-web`

### deploy-remote.sh

**Location**: `scripts/deploy-remote.sh`

**Purpose**: Convenience wrapper for running the VPS deploy script over SSH from your Mac.

**Usage:**
```bash
./scripts/deploy-remote.sh user@your-vps
./scripts/deploy-remote.sh user@your-vps main
```

**Notes:**
- Defaults the remote repo path to `$HOME/scps`
- Override with `SCPS_REMOTE_PATH=/custom/path`

## Database Scripts

Database initialization, bootstrapping, resets, and secure backups have been fully consolidated into the TypeScript administrative CLI under the `./scps-cli users` (interactive database schema and admin registration) and `./scps-cli import-db` (database overwrite and active log purge) subcommands.

Refer to the **Unified Administrative CLI** section at the top of this document for execution guides.

---

### reset_db.sh

**Location**: `scripts/reset_db.sh`

**Purpose**: Quick developer-centric database reset.

**Usage:**
```bash
./scripts/reset_db.sh
```

**Interactive Flow:**
1. Confirms migrations/schema.sql exists
2. Prompts for confirmation (type 'yes')
3. Creates timestamped backup
4. Removes old database files
5. Re-runs database initializers to reinitialize

**When to Use:**
- Quick resets during development
- Scripting/automation (non-interactive mode possible)

### run_migration.sh

**Location**: `scripts/run_migration.sh`

**Purpose**: Run SQL migrations with automatic backup.

**Usage:**
```bash
./scripts/run_migration.sh migrate_cascade_delete.sql
./scripts/run_migration.sh migrate_decimal_currency.sql
```

**Steps:**
1. Checks database file exists
2. Locates migration file (in migrations/ or specified path)
3. Creates timestamped backup
4. Runs migration SQL file
5. Tests foreign key constraints
6. Provides rollback instructions

**Output:**
```
=== Student Deletion Fix Migration ===

1. Creating backup: stuco.db.backup.20251110_005702
   ✓ Backup created

2. Running migration...
   ✓ Migration completed successfully!

3. Testing deletion functionality...
   ✓ Foreign keys are enabled

=== Migration Complete ===

Student deletion should now work properly!
Backup saved as: stuco.db.backup.20251110_005702

If you encounter any issues, restore the backup with:
  cp stuco.db.backup.20251110_005702 stuco.db
```

**When to Use:**
- Applying schema changes to existing database
- Upgrading from older versions
- Adding new features requiring schema updates

**Safety Features:**
- Automatic backup before migration
- Exit on error with automatic rollback
- Verification of foreign key constraints
- Clear rollback instructions

### cloud_backup_r2.sh

**Location**: `scripts/cloud_backup_r2.sh`

**Purpose**: Automated database backup to Cloudflare R2 with local retention.

**Usage:**
```bash
./scripts/cloud_backup_r2.sh
```

**Prerequisites:**
- rclone installed (`sudo apt install rclone`)
- rclone configured for Cloudflare R2 (see documentation)

**Environment Variables:**
```bash
export RCLONE_REMOTE="r2"  # Raw R2 remote name (default: r2)
export RCLONE_CRYPT_REMOTE="r2-crypt"  # Encrypted remote used by scripts
export R2_PATH="stuco-db-backups"  # Path within bucket for backups (default: stuco-db-backups)
```

**Setup:**
```bash
./scripts/setup-r2-crypt.sh
```

**Steps:**
1. Creates compressed `.tar.zst` backup of `stuco.db`, `stuco.db-wal`, `stuco.db-shm`
2. Stores backup locally in `db_backups/` with timestamp
3. Uploads to the encrypted `rclone crypt` remote
4. Displays backup summary and statistics
5. Keeps local backup (does not auto-delete)

**Output:**
```
============================================================
STUCO Cloudflare R2 Database Backup (rclone)
============================================================
Timestamp: 20251110_005702

------------------------------------------------------------
Step 1: Creating compressed backup
------------------------------------------------------------
✓ All database files included
✓ Local backup created: db_backups/stuco_backup_20251110_005702.tar.zst (45K)

------------------------------------------------------------
Step 2: Uploading to Cloudflare R2
------------------------------------------------------------
Remote: r2-crypt:
File: stuco_backup_20251110_005702.tar.zst
✓ Upload successful!

------------------------------------------------------------
Step 3: Backup Summary
------------------------------------------------------------
Local backups: 5 files (225K total)
Latest backup: db_backups/stuco_backup_20251110_005702.tar.zst (45K)

Checking R2 bucket contents...
R2 backups: 12 files

============================================================
✓ Backup Complete!
============================================================

Local:  db_backups/stuco_backup_20251110_005702.tar.zst
Remote: r2-crypt:stuco_backup_20251110_005702.tar.zst
```

**When to Use:**
- Automated daily cloud backups (via cron)
- Off-site disaster recovery
- Compliance with data retention policies
- Before major system changes

**Cron Setup:**
```bash
# Daily at 2 AM
0 2 * * * cd $PROJECT_ROOT && ./scripts/cloud_backup_r2.sh >> logs/r2_backup.log 2>&1

# With custom remote/path
0 2 * * * cd $PROJECT_ROOT && RCLONE_REMOTE=my-r2 RCLONE_CRYPT_REMOTE=my-r2-crypt R2_PATH=my-backups ./scripts/cloud_backup_r2.sh >> logs/r2_backup.log 2>&1
```

### setup-r2-crypt.sh

**Location**: `scripts/setup-r2-crypt.sh`

**Purpose**: Configure both the raw Cloudflare R2 remote and the encrypted `rclone crypt` remote used by the backup scripts.

**Usage:**
```bash
./scripts/setup-r2-crypt.sh
```

### restore_from_r2.sh

**Location**: `scripts/restore_from_r2.sh`

**Purpose**: Restore database from Cloudflare R2 backup.

**Usage:**
```bash
./scripts/restore_from_r2.sh <backup_filename.tar.zst>
```

**Example:**
```bash
# List available backups first
rclone ls r2-crypt:

# Restore specific backup
./scripts/restore_from_r2.sh stuco_backup_20251110_005702.tar.zst
```

**Steps:**
1. Downloads backup from R2 to `db_backups/` using rclone
2. Creates safety backup of current database
3. Extracts and restores database files
4. Provides verification commands

**Safety Features:**
- Backs up current database before restore
- Checks rclone remote configuration before proceeding
- Validates download success
- Clear error messages

## Student Management Scripts

### batch_import_students.py

**Location**: `hardware-pi/batch_import_students.py`

**Purpose**: Batch import multiple students from a CSV file with validation and error handling.

**Usage:**
```bash
# Generate template CSV
python hardware-pi/batch_import_students.py --template students.csv

# Preview import (dry run)
python hardware-pi/batch_import_students.py --dry-run students.csv

# Import students
python hardware-pi/batch_import_students.py students.csv

# Fail on duplicates instead of skipping
python hardware-pi/batch_import_students.py --no-skip-duplicates students.csv
```

**Options:**
- `--template` - Generate a template CSV file
- `--dry-run` - Preview import without making changes
- `--no-skip-duplicates` - Fail on duplicate names instead of skipping them

**CSV Format:**

Basic (names only):
```csv
name
John Doe
Jane Smith
Alice Johnson
```

With NFC card UIDs:
```csv
name,uid
Ivan Belousov,0E39E996
John Doe,DEADBEEF
Jane Smith,AB12CD34
Alice Johnson,
```

**Features:**
- ✓ Validates CSV format before importing
- ✓ Optional NFC card UID import (associate cards with students)
- ✓ Skips duplicate students (or fails if preferred)
- ✓ Creates student accounts automatically
- ✓ Can add cards to existing students
- ✓ Validates UID format (hexadecimal)
- ✓ Prevents duplicate card assignments
- ✓ Detailed error reporting
- ✓ Dry-run mode to preview changes
- ✓ Transaction safety (all-or-nothing)
- ✓ UTF-8 support for international names

**Output (with UIDs):**
```
UID column detected - will import cards with students
Found 5 students in CSV file

✓ Imported: Ivan Belousov (ID: 42) → 0E39E996
✓ Imported: John Doe (ID: 43) → DEADBEEF
⊘ Skipping duplicate: Alice Johnson (ID: 12)
⊕ Added card to existing student: Bob Wilson (ID: 15) → AB12CD34
✓ Imported: Charlie Brown (ID: 44)

Changes committed to database

============================================================
Import Summary:
  Imported: 4
  Cards created: 3
  Skipped (duplicates): 1
  Validation errors: 0
  Import errors: 0
============================================================
```

**When to Use:**
- Importing class rosters at start of year
- Bulk student enrollment
- Migrating from another system
- Adding multiple students at once
- Testing with sample data

**See Also:**
- [Batch Import Students Guide](batch-import-students.md) - Comprehensive guide with examples and SQL import methods

## NFC Scripts

### tap-broadcaster.py

**Location**: `hardware-pi/tap-broadcaster.py`

**Purpose**: Broadcast NFC card taps to web UI via WebSocket connection.

**Version**: WebSocket v2.0 (async, with card presence tracking)

**Usage:**

**Simulation Mode (No Hardware):**
```bash
python hardware-pi/tap-broadcaster.py --simulate
> DEADBEEF
> CAFE1234
> quit
```

**Hardware Mode (PN532 Reader):**
```bash
# UART connection (recommended for Raspberry Pi)
python hardware-pi/tap-broadcaster.py --device tty:AMA0:pn532

# USB connection
python hardware-pi/tap-broadcaster.py --device tty:USB0:pn532

# I2C connection (uses libnfc)
python hardware-pi/tap-broadcaster.py --device i2c:/dev/i2c-1:pn532
```

**Test Mode (Single Tap):**
```bash
python hardware-pi/tap-broadcaster.py --test
```

**Options:**
- `--url` - Next.js server URL (default: http://localhost:3000)
- `--secret` - Shared secret for authentication
- `--lane` - POS lane identifier (default: 'default')
- `--device` - NFC reader device string (default: tty:AMA0:pn532)
- `--simulate` - Manual UID entry mode
- `--test` - Send single test tap and exit

**Environment Variables:**
- `NEXTJS_URL` - Server URL
- `NFC_TAP_SECRET` - Authentication secret
- `POS_LANE_ID` - Lane identifier
- `PN532_DEVICE` - Default device

**Features:**
- **WebSocket connection** with automatic reconnection
- **Card presence tracking** - detects card removal, prevents duplicates
- **Async operation** - efficient, non-blocking
- **Smart debouncing** - 1.5s per-card tracking
- **Exponential backoff** - intelligent reconnection on failures
- Supports TTY, USB, and I2C connections
- Graceful signal handling (SIGINT, SIGTERM)
- Comprehensive logging with connection status

**Output:**
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

**When to Use:**
- Development: `--simulate` for testing without hardware
- Production: Run as systemd service (see tap-broadcaster.service)
- Testing: `--test` to verify server connectivity
- Debugging: Watch logs for WebSocket connection status

**Systemd Service:**

See `systemd/tap-broadcaster.service` for systemd configuration.

```bash
# Install service
sudo cp systemd/tap-broadcaster.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tap-broadcaster
sudo systemctl start tap-broadcaster

# Check status
sudo systemctl status tap-broadcaster

# View logs (live)
journalctl -u tap-broadcaster -f

# View recent logs
journalctl -u tap-broadcaster -n 100
```

**Dependencies:**
- `websockets>=13.1` - WebSocket client library
- `nfcpy>=1.0.4` - NFC reader library (TTY/USB)
- `libnfc-bin` - For I2C connections (optional)

**Troubleshooting:**
- Connection issues: Check `[WS]` log messages
- Auth failures: Verify NFC_TAP_SECRET matches server
- Reader issues: Check `[NFC]` log messages and hardware connections
- Duplicate taps: Should be handled automatically; check debounce logs

## Deprecated Legacy Python CLI Tools

The legacy standalone Python CLI tools (`pos.py`, `topup.py`, `enroll.py`, `reset_db.py`, and `init_db.py`) have been fully deprecated and deleted from the codebase.

Use the unified TypeScript CLI for administration and imports. Initialize new databases with the existing core and auth SQL schemas; see [Getting Started](getting-started.md).

## Testing Scripts

### Database Integrity

```bash
sqlite3 /absolute/path/to/stuco.db "PRAGMA integrity_check;"
```

Use the database path configured in `.env.local`; expected output is `ok`.


### test_readers.py

**Location**: `hardware-pi/test_readers.py`

**Purpose**: Test multiple NFC readers connected simultaneously.

**Usage:**
```bash
python hardware-pi/test_readers.py
```

**Features:**
- Automatically detects all available USB NFC readers
- Tests each reader independently
- Displays reader ID and device path
- Useful for dual-reader setup verification

**When to Use:**
- Setting up multiple NFC readers
- Verifying reader detection and identification
- Troubleshooting dual-reader configurations

### test_usb_ports.py

**Location**: `hardware-pi/test_usb_ports.py`

**Purpose**: Diagnostic tool for USB port detection and reader identification.

**Usage:**
```bash
python hardware-pi/test_usb_ports.py
```

**Features:**
- Lists all detected USB serial devices
- Shows device paths and attributes
- Helps identify which physical USB port corresponds to which device
- Useful for systemd service configuration

**When to Use:**
- Determining correct device paths for broadcaster configuration
- Troubleshooting USB device detection issues
- Verifying USB permissions

### diagnose_nfc.py

**Location**: `hardware-pi/diagnose_nfc.py`

**Purpose**: Comprehensive NFC hardware diagnostic and troubleshooting tool.

**Usage:**
```bash
python hardware-pi/diagnose_nfc.py
```

**Features:**
- Tests NFC reader connectivity
- Verifies nfcpy library installation
- Checks device permissions
- Attempts card detection
- Provides detailed error messages and solutions

**When to Use:**
- NFC reader not working
- Setting up NFC hardware for the first time
- Troubleshooting card detection issues
- Verifying hardware configuration

**Output Example:**
```
[CHECK] Checking nfcpy installation...
✓ nfcpy is installed

[CHECK] Scanning for NFC devices...
✓ Found device: tty:USB0:pn532

[CHECK] Testing card detection...
✓ Place a card on the reader...
✓ Card detected: 04A1B2C3

[RESULT] NFC hardware is working correctly!
```

## Utility Scripts

### Migration SQL Files

**migrate_cascade_delete.sql**: Adds ON DELETE CASCADE to foreign keys.

**migrate_decimal_currency.sql**: Converts integer currency to tenths (decimal support).

See [Database Guide](database.md) for migration details.

## Script Cheat Sheet

| Task | Command |
|------|---------|
| Check prerequisites | `./scripts/web-next-check-prereqs.sh` |
| Setup web UI | `cd web-next && pnpm install` |
| Setup web UI (manual) | `./scripts/web-next-setup.sh` |
| Initialize database | Apply `migrations/schema.sql` and `web-next/migrations/better_auth_schema.sql`; see Getting Started |
| Reset database (quick) | `./scripts/reset_db.sh` |
| Run migration | `./scripts/run_migration.sh migrate_file.sql` |
| Backup to cloud (R2) | `./scripts/cloud_backup_r2.sh` |
| Restore from cloud (R2) | `./scripts/restore_from_r2.sh backup_file.tar.gz` |
| Test NFC (simulate) | `python hardware-pi/tap-broadcaster.py --simulate` |
| Test NFC (hardware) | `python hardware-pi/tap-broadcaster.py --device tty:AMA0:pn532` |
| POS and card enrollment | Web interface `/pos` and `/students` |
| CLI balance adjustment | `./scps-cli ledger` |
| Test DB integrity | `sqlite3 /absolute/path/to/stuco.db "PRAGMA integrity_check;"` |
| Start web UI | `cd web-next && pnpm dev` |
| Build production | `cd web-next && pnpm build` |

## Automation

### Daily Backups

Add to crontab:

```bash
# Backup database daily at 2 AM
0 2 * * * cd /home/stuco/stuco && tar -czf db_backups/auto_$(date +\%Y\%m\%d).tar.gz stuco.db*

# Clean old backups (30+ days)
0 3 * * * find /home/stuco/stuco/db_backups -name "auto_*.tar.gz" -mtime +30 -delete
```

### Weekly Reports

Example script for weekly transaction summary:

```bash
#!/bin/bash
# weekly_report.sh
sqlite3 stuco.db <<EOF
.mode column
.headers on
SELECT 
  strftime('%Y-W%W', created_at) as week,
  COUNT(*) as transactions,
  SUM(CASE WHEN type='TOPUP' THEN amount ELSE 0 END) as topups,
  SUM(CASE WHEN type='DEBIT' THEN -amount ELSE 0 END) as debits
FROM transactions
WHERE created_at >= date('now', '-7 days')
GROUP BY week;
EOF
```

### Balance Adjustments

Use `./scps-cli ledger` for interactive top-ups and adjustments. The removed Python top-up script is no longer available for CSV automation.


## Troubleshooting

### Script Not Executable

```bash
chmod +x script_name.sh
./script_name.sh
```

### Python Environment

Always activate virtual environment:

```bash
source .venv/bin/activate
python script.py
```

### Node Not Found

Ensure Node.js installed:

```bash
node --version
# If not found, install via nvm or package manager
```

### Permission Denied

Run as correct user:

```bash
# For systemd scripts
sudo -u stuco ./script.sh

# For database scripts
chown stuco:stuco stuco.db*
```

## Best Practices

- **Always backup** before running destructive scripts (reset, migration)
- **Test in development** before production
- **Use simulation modes** to test without hardware
- **Check exit codes** in automation scripts
- **Log script output** for troubleshooting
- **Version control** custom scripts in git

## Resources

- [Getting Started](getting-started.md) - Setup guides
- [Database Guide](database.md) - Database operations
- [NFC Setup](nfc-setup.md) - NFC configuration
- [Deployment Guide](deployment.md) - Production deployment

**Last updated: November 22, 2025**
