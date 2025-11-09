# Scripts Reference

Documentation for all utility scripts in the Stuco system, including setup, maintenance, and testing tools.

## Overview

The Stuco project includes various scripts for:
- **Setup**: Installing dependencies and configuring the environment
- **Database**: Initialization, migration, backup, and reset
- **NFC**: Testing and broadcasting card taps
- **Maintenance**: Checking prerequisites and troubleshooting

## Setup Scripts

### check-prereqs.sh

**Location**: `web-next/check-prereqs.sh`

**Purpose**: Verify build tools and dependencies before installing.

**Usage:**
```bash
cd web-next
./check-prereqs.sh
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

### setup.sh

**Location**: `web-next/setup.sh`

**Purpose**: Legacy manual setup for better-sqlite3 when postinstall fails.

**Usage:**
```bash
cd web-next
./setup.sh
```

**Steps:**
1. Runs `pnpm install` to install dependencies
2. Navigates to better-sqlite3 directory
3. Manually builds native bindings with `npm run build-release`
4. Returns to web-next root

**When to Use:**
- If `pnpm install` postinstall hook fails
- On platforms with complex build requirements
- When `check-prereqs.sh` passes but postinstall still fails

**Note**: Modern `pnpm install` includes automatic postinstall, so this is rarely needed.

## Database Scripts

### init_db.py

**Location**: `init_db.py` (root)

**Purpose**: Initialize fresh database from schema.sql.

**Usage:**
```bash
python init_db.py
```

**Actions:**
- Reads `schema.sql`
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

1. Creating backup: db_backups/stuco_backup_20251109_143022.db
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

**Location**: `reset_db.sh` (root)

**Purpose**: Quick bash-based database reset (simpler than Python version).

**Usage:**
```bash
./reset_db.sh
```

**Interactive Flow:**
1. Confirms schema.sql exists
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

**Location**: `run_migration.sh` (root)

**Purpose**: Run SQL migrations with automatic backup.

**Usage:**
```bash
./run_migration.sh migrate_cascade_delete.sql
./run_migration.sh migrate_decimal_currency.sql
```

**Steps:**
1. Checks database file exists
2. Creates timestamped backup
3. Runs migration SQL file
4. Tests foreign key constraints
5. Provides rollback instructions

**Output:**
```
=== Student Deletion Fix Migration ===

1. Creating backup: stuco.db.backup.20251109_143522
   ✓ Backup created

2. Running migration...
   ✓ Migration completed successfully!

3. Testing deletion functionality...
   ✓ Foreign keys are enabled

=== Migration Complete ===

Student deletion should now work properly!
Backup saved as: stuco.db.backup.20251109_143522

If you encounter any issues, restore the backup with:
  cp stuco.db.backup.20251109_143522 stuco.db
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

## NFC Scripts

### tap-broadcaster.py

**Location**: `tap-broadcaster.py` (root)

**Purpose**: Broadcast NFC card taps to web UI via HTTP POST + SSE.

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
# UART connection
python tap-broadcaster.py --device tty:AMA0:pn532

# USB connection
python tap-broadcaster.py --device usb:001:003

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
- `--device` - NFC reader device string
- `--simulate` - Manual UID entry mode
- `--test` - Send single test tap and exit

**Environment Variables:**
- `NEXTJS_URL` - Server URL
- `NFC_TAP_SECRET` - Authentication secret
- `POS_LANE_ID` - Lane identifier
- `PN532_DEVICE` - Default device

**Features:**
- Reads card UIDs from PN532 reader
- POSTs to `/api/nfc/tap` endpoint
- 800ms debouncing to prevent double-taps
- Supports TTY, USB, and I2C connections
- Graceful error handling
- Comprehensive logging

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for Stuco POS System             ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  http://localhost:3000                               ║
║ Lane:    default                                             ║
║ Device:  tty:AMA0:pn532                                      ║
║ Secret:  [SET]                                               ║
╚═══════════════════════════════════════════════════════════════╝

[NFC] Waiting for card tap on tty:AMA0:pn532...
[OK] Tap broadcast: DEADBEEF → 1 listener(s)
```

**When to Use:**
- Development: `--simulate` for testing without hardware
- Production: Run as systemd service (see tap-broadcaster.service)
- Testing: `--test` to verify server connectivity

**Systemd Service:**

See `tap-broadcaster.service` for systemd configuration.

```bash
# Install service
sudo cp tap-broadcaster.service /etc/systemd/system/
sudo systemctl enable tap-broadcaster
sudo systemctl start tap-broadcaster

# Check status
sudo systemctl status tap-broadcaster

# View logs
journalctl -u tap-broadcaster -f
```

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

## Utility Scripts

### Migration SQL Files

**migrate_cascade_delete.sql**: Adds ON DELETE CASCADE to foreign keys.

**migrate_decimal_currency.sql**: Converts integer currency to tenths (decimal support).

See [Database Guide](database.md) for migration details.

## Script Cheat Sheet

| Task | Command |
|------|---------|
| Check prerequisites | `cd web-next && ./check-prereqs.sh` |
| Setup web UI | `cd web-next && pnpm install` |
| Setup web UI (manual) | `cd web-next && ./setup.sh` |
| Initialize database | `python init_db.py` |
| Reset database (production) | `python reset_db.py` |
| Reset database (quick) | `./reset_db.sh` |
| Run migration | `./run_migration.sh migrate_file.sql` |
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

**Updated**: November 2025

