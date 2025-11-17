# Scripts Reference

Documentation for all utility scripts in the Student Council Payment System, including setup, maintenance, and testing tools.

## Overview

The Student Council Payment System includes various scripts for:
- **Setup**: Installing dependencies and configuring the environment
- **Database**: Initialization, migration, backup, and reset
- **NFC**: Testing and broadcasting card taps
- **Student Management**: Enrollment and batch imports
- **Maintenance**: Checking prerequisites and troubleshooting

## Setup Scripts

### web-next-check-prereqs.sh

**Location**: `scripts/web-next-check-prereqs.sh`

**Purpose**: Verify build tools and dependencies before installing.

**Usage:**
```bash
./scripts/web-next-check-prereqs.sh
```

**Checks:**
- Operating system (macOS or Linux)
- Xcode Command Line Tools (macOS)
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

## Database Scripts

### init_db.py

**Location**: `init_db.py` (root)

**Purpose**: Initialize fresh database from migrations/schema.sql.

**Usage:**
```bash
python init_db.py
```

**Actions:**
- Reads `migrations/schema.sql`
- Creates `stuco.db` if it doesn't exist
- Executes schema to create tables
- Enables foreign keys
- Sets WAL journal mode

**Output:**
```
Database initialized successfully!
Tables created: students, cards, accounts, transactions, overdraft_weeks, users
```

**When to Use:**
- First-time setup
- After deleting database
- For testing with fresh data

**Note**: Safe to run multiple times (uses `CREATE TABLE IF NOT EXISTS`).

### reset_db.py

**Location**: `reset_db.py` (root)

**Purpose**: Production-safe database reset with backup and optional admin user creation.

**Usage:**
```bash
python reset_db.py
```

**Interactive Flow:**
1. Prompts for confirmation (type 'RESET')
2. Creates timestamped backup in `db_backups/`
3. Removes old database files (db, wal, shm)
4. Initializes fresh database
5. Optionally creates admin user with password hashing

**Features:**
- Automatic backup before reset
- Password hashing with bcryptjs
- Admin user creation
- Timestamped backups
- Rollback instructions if issues occur

**Example Session:**
```
⚠️  WARNING: This will DELETE all existing data!
Type 'RESET' to confirm: RESET

1. Creating backup: db_backups/stuco_backup_20251110_005702.db
✓ Backup created

2. Removing old database files
Removed: stuco.db

3. Creating fresh database
✓ Database created

4. Create admin user (optional)
Create an admin user? (y/n): y
Admin name: John Doe
Admin email: john@example.com
Admin password: ********
✓ Admin user created

✓ Database reset complete!
```

**When to Use:**
- Resetting for new school year
- Recovering from corruption
- Testing with clean slate
- Setting up production instance

### reset_db.sh

**Location**: `scripts/reset_db.sh`

**Purpose**: Quick bash-based database reset (simpler than Python version).

**Usage:**
```bash
./scripts/reset_db.sh
```

**Interactive Flow:**
1. Confirms migrations/schema.sql exists
2. Prompts for confirmation (type 'yes')
3. Creates timestamped backup
4. Removes old database files
5. Calls `python init_db.py` to reinitialize

**When to Use:**
- Quick resets during development
- When Python environment isn't activated
- Scripting/automation (non-interactive mode possible)

**Differences from reset_db.py:**
- No admin user creation
- Simpler confirmation ('yes' vs 'RESET')
- Bash-based (no Python imports needed)
- Faster for development workflows

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
export RCLONE_REMOTE="r2"  # Your rclone remote name (default: r2)
export R2_PATH="stuco-db-backups"  # Path within bucket for backups (default: stuco-db-backups)
```

**Setup:**
```bash
# Configure rclone for R2
rclone config
# Choose: s3, Provider: Cloudflare, Enter credentials
```

**Steps:**
1. Creates compressed `.tar.gz` backup of `stuco.db`, `stuco.db-wal`, `stuco.db-shm`
2. Stores backup locally in `db_backups/` with timestamp
3. Uploads to Cloudflare R2 bucket using rclone
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
✓ Local backup created: db_backups/stuco_backup_20251110_005702.tar.gz (45K)

------------------------------------------------------------
Step 2: Uploading to Cloudflare R2
------------------------------------------------------------
Remote: r2:stuco-db-backups/
File: stuco_backup_20251110_005702.tar.gz
✓ Upload successful!

------------------------------------------------------------
Step 3: Backup Summary
------------------------------------------------------------
Local backups: 5 files (225K total)
Latest backup: db_backups/stuco_backup_20251110_005702.tar.gz (45K)

Checking R2 bucket contents...
R2 backups: 12 files

============================================================
✓ Backup Complete!
============================================================

Local:  db_backups/stuco_backup_20251110_005702.tar.gz
Remote: r2:stuco-db-backups/stuco_backup_20251110_005702.tar.gz
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
0 2 * * * cd $PROJECT_ROOT && RCLONE_REMOTE=my-r2 R2_PATH=my-backups ./scripts/cloud_backup_r2.sh >> logs/r2_backup.log 2>&1
```

### restore_from_r2.sh

**Location**: `scripts/restore_from_r2.sh`

**Purpose**: Restore database from Cloudflare R2 backup.

**Usage:**
```bash
./scripts/restore_from_r2.sh <backup_filename.tar.gz>
```

**Example:**
```bash
# List available backups first
rclone ls r2:stuco-db-backups/

# Restore specific backup
./scripts/restore_from_r2.sh stuco_backup_20251110_005702.tar.gz
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

### enroll.py

**Location**: `enroll.py` (root)

**Purpose**: Enroll a student by associating their name with an NFC card UID.

**Usage:**
```bash
# Interactive mode
python enroll.py

# With arguments
python enroll.py --name "John Doe"

# Simulate without NFC reader
python enroll.py --name "Jane Smith" --simulate DEADBEEF

# Custom device
python enroll.py --device usb:USB0:pn532
```

**Options:**
- `--name` - Student name (optional, will prompt if not provided)
- `--device` - NFC reader device string (default: tty:AMA0:pn532)
- `--simulate` - Provide UID hex manually (no reader required)

**Process:**
1. Prompts for student name if not provided
2. Reads NFC card UID from reader (or uses simulated UID)
3. Creates student record if doesn't exist
4. Creates account for student
5. Associates card UID with student

**Output:**
```
Student name: John Doe
UID: DEADBEEF
Enrolled John Doe → DEADBEEF
```

**When to Use:**
- Enrolling individual students with NFC cards
- Initial card issuance
- Replacing lost cards
- Testing with simulated UIDs

### batch_import_students.py

**Location**: `batch_import_students.py` (root)

**Purpose**: Batch import multiple students from a CSV file with validation and error handling.

**Usage:**
```bash
# Generate template CSV
python batch_import_students.py --template students.csv

# Preview import (dry run)
python batch_import_students.py --dry-run students.csv

# Import students
python batch_import_students.py students.csv

# Fail on duplicates instead of skipping
python batch_import_students.py --no-skip-duplicates students.csv
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

**Location**: `tap-broadcaster.py` (root)

**Purpose**: Broadcast NFC card taps to web UI via WebSocket connection.

**Version**: WebSocket v2.0 (async, with card presence tracking)

**Usage:**

**Simulation Mode (No Hardware):**
```bash
python tap-broadcaster.py --simulate
> DEADBEEF
> CAFE1234
> quit
```

**Hardware Mode (PN532 Reader):**
```bash
# UART connection (recommended for Raspberry Pi)
python tap-broadcaster.py --device tty:AMA0:pn532

# USB connection
python tap-broadcaster.py --device tty:USB0:pn532

# I2C connection (uses libnfc)
python tap-broadcaster.py --device i2c:/dev/i2c-1:pn532
```

**Test Mode (Single Tap):**
```bash
python tap-broadcaster.py --test
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

## CLI Tools

### pos.py

**Location**: `pos.py` (root)

**Purpose**: Command-line point-of-sale for charging via NFC card taps.

**Usage:**

**Simulation Mode:**
```bash
python pos.py 6.5 --simulate
> DEADBEEF
[OK] Charged ¥6.5 (overpay used ¥0.0). New balance: ¥43.5. TX ID: 42
```

**Hardware Mode:**
```bash
python pos.py 6.5 --device tty:AMA0:pn532
# Tap card on reader
[OK] Charged ¥6.5 (overpay used ¥0.0). New balance: ¥43.5. TX ID: 42
```

**Arguments:**
- `price` (required) - Price per tap in CNY (e.g., 6.5 for ¥6.5)
- `--device` - NFC device string (default: tty:AMA0:pn532)
- `--simulate` - Manual UID entry mode

**Features:**
- Reads card UID and charges immediately
- Overdraft support (¥20/week, resets Monday)
- Decimal currency support (¥X.X)
- Transaction logging with card UID
- Weekly overpay tracking

**When to Use:**
- Quick sales without web UI
- Testing NFC reader
- Offline POS terminal

### topup.py

**Location**: `topup.py` (root)

**Purpose**: Add funds to student account via card UID.

**Usage:**
```bash
python topup.py DEADBEEF 20.0
# Topped up ¥20.0. New balance: ¥63.5. TX ID: 43

python topup.py CAFE1234 10.5 --staff "Jane Doe"
# Topped up ¥10.5. New balance: ¥30.5. TX ID: 44
```

**Arguments:**
- `uid` (required) - Card UID in hex
- `amount` (required) - Amount in CNY (e.g., 20.5 for ¥20.5)
- `--staff` - Staff member name (default: 'admin')

**Features:**
- Decimal currency support
- Transaction logging with card UID and staff
- Balance display after top-up

**When to Use:**
- Manual top-ups without web UI
- Bulk top-ups via script
- Testing transactions

### enroll.py

**Location**: `enroll.py` (root)

**Purpose**: Enroll new students and associate NFC cards.

**Usage:**

**Interactive Mode:**
```bash
python enroll.py
Student name: John Smith
# Tap card on reader
UID: DEADBEEF
Enrolled John Smith → DEADBEEF
```

**Command-Line Mode:**
```bash
python enroll.py --name "Jane Doe" --simulate ABC123
UID: ABC123
Enrolled Jane Doe → ABC123
```

**Arguments:**
- `--name` - Student name (prompts if not provided)
- `--device` - NFC device string
- `--simulate` - Manual UID entry

**Features:**
- Creates student record if doesn't exist
- Creates account with ¥0 balance
- Associates card UID with student
- Replaces existing card if UID already enrolled

**When to Use:**
- Quick enrollment without web UI
- Bulk enrollment via script
- Testing card reading

## Testing Scripts

### test-db.js

**Location**: `web-next/test-db.js`

**Purpose**: Test database connection and query basic stats.

**Usage:**
```bash
cd web-next
node test-db.js
```

**Output:**
```
Testing database connection...
✓ Database connected successfully!

Database Stats:
- Students: 42
- Cards: 58
- Transactions: 1,234
- Total Balance: ¥1,850.50

✓ All tests passed!
```

**When to Use:**
- After `pnpm install` to verify better-sqlite3
- Troubleshooting database connection issues
- Verifying DATABASE_PATH in .env.local

### test_readers.py

**Location**: `test_readers.py` (root)

**Purpose**: Test multiple NFC readers connected simultaneously.

**Usage:**
```bash
python test_readers.py
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

**Location**: `test_usb_ports.py` (root)

**Purpose**: Diagnostic tool for USB port detection and reader identification.

**Usage:**
```bash
python test_usb_ports.py
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

**Location**: `diagnose_nfc.py` (root)

**Purpose**: Comprehensive NFC hardware diagnostic and troubleshooting tool.

**Usage:**
```bash
python diagnose_nfc.py
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
| Initialize database | `python init_db.py` |
| Reset database (production) | `python reset_db.py` |
| Reset database (quick) | `./scripts/reset_db.sh` |
| Run migration | `./scripts/run_migration.sh migrate_file.sql` |
| Backup to cloud (R2) | `./scripts/cloud_backup_r2.sh` |
| Restore from cloud (R2) | `./scripts/restore_from_r2.sh backup_file.tar.gz` |
| Test NFC (simulate) | `python tap-broadcaster.py --simulate` |
| Test NFC (hardware) | `python tap-broadcaster.py --device tty:AMA0:pn532` |
| CLI POS (simulate) | `python pos.py 6.5 --simulate` |
| CLI top-up | `python topup.py CARD_UID 20.0` |
| CLI enroll | `python enroll.py` |
| Test DB connection | `cd web-next && node test-db.js` |
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

### Bulk Operations

Bulk top-up from CSV:

```bash
#!/bin/bash
# bulk_topup.sh
while IFS=, read -r uid amount; do
  python topup.py "$uid" "$amount" --staff "Bulk Import"
done < topups.csv
```

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

**Last updated: November 12, 2025**

