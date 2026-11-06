# Database Guide

The system uses a single SQLite database (`stuco.db`) shared between CLI tools and web UI. This guide covers schema, connections, and migrations.

## Schema

Initialize a new database with `sqlite3 stuco.db < migrations/schema.sql`, then `sqlite3 stuco.db < web-next/migrations/better_auth_schema.sql`. Substitute the path configured in `DATABASE_PATH`, then run `./scps-cli users` to create an administrator.

### Full Schema (schema.sql)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cards (
  card_uid TEXT PRIMARY KEY,              -- hex UID
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active|revoked
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  student_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,            -- tenths of CNY, e.g., 55 = ¥5.5
  max_overdraft_week INTEGER NOT NULL DEFAULT 200, -- tenths of CNY, e.g., 200 = ¥20.0/week
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount INTEGER NOT NULL,                       -- + for topup/adjust, - for debit; tenths of CNY
  overdraft_component INTEGER NOT NULL DEFAULT 0, -- part of DEBIT from weekly overdraft; tenths
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Weekly overdraft usage, keyed by Monday 00:00 Asia/Shanghai (UTC)
CREATE TABLE IF NOT EXISTS overdraft_weeks (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,               -- tenths of CNY used this week
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_student_time
  ON transactions(student_id, created_at);

-- Staff users (legacy, Better Auth tables used instead)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Key Notes**:
- **Currency**: Stored in tenths (e.g., 55 = ¥5.5) for decimal precision.
- **Foreign Keys**: Enabled with CASCADE delete for data integrity.
- **Timestamps**: UTC ISO strings.
- **WAL Mode**: Recommended for concurrent access (web + CLI).

### Indexes

- `idx_tx_student_time`: Speeds up transaction queries by student and time.

## Connection

### CLI (Python)

Uses `sqlite3` standard library. Example in `pos.py`:

```python
con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON;")
con.execute("PRAGMA busy_timeout=5000;")  # Handle locks
```

### Web UI (Next.js)

Uses `better-sqlite3` for synchronous access.

In `web-next/lib/db.ts`:

```typescript
import Database from 'better-sqlite3';

const db = new Database(process.env.DATABASE_PATH || ':memory:');
db.pragma('foreign_keys = ON');

export default db;
```

**Config**: Set `DATABASE_PATH` in `.env.local` (absolute path).

**Test Connection**:

```bash
sqlite3 /absolute/path/to/stuco.db "PRAGMA integrity_check;"
```

Expected output: `ok`. Use the database path from `.env.local`.

### Compatibility

- CLI and web share the DB; changes sync immediately.
- WAL mode allows concurrent reads/writes.
- No migrations needed for basic use; schema matches.

## Migrations

Migrations update existing DBs. Run with `./scripts/run_migration.sh <script.sql>` (backs up first).

### 1. Cascade Delete (migrate_cascade_delete.sql)

**Problem**: Deleting students failed if transactions/overdrafts existed.

**Fix**: Added `ON DELETE CASCADE` to foreign keys in transactions and overdraft_weeks.

**What It Does**:
- Delete student → auto-deletes cards, account, transactions, overdraft records.
- Backup created: `stuco.db.backup.<timestamp>`.

**Status**: Complete; new DBs use updated schema.

**Rollback**: `cp stuco.db.backup.<timestamp> stuco.db`

### 2. Decimal Currency (migrate_decimal_currency.sql)

**Problem**: Integer-only currency (no decimals).

**Fix**: Scale all monetary fields by 10 (e.g., ¥5.5 → 55 tenths).
- Multiplied balances, amounts, overdrafts by 10.
- Updated schema comments and defaults (max_overdraft_week=200).
- Code updated: Helpers for conversion (web: currency.ts, CLI: float parsing).

**What It Does**:
- Preserves data: Existing ¥5 becomes ¥5.0 (50 tenths).
- Enables ¥X.X precision.
- Backup created.

**Status**: Complete; supports decimals in UI/CLI.

**Examples**:
- Input: 5.5 → DB: 55
- Display: 55 → "¥5.5"

**Rollback**: Restore backup, revert code.

### Running Migrations

1. Backup manually: `cp stuco.db stuco.db.backup`.

2. Run:

   ```bash
   ./scripts/run_migration.sh migrate_cascade_delete.sql
   ./scripts/run_migration.sh migrate_decimal_currency.sql
   ```

3. Verify: `sqlite3 stuco.db "SELECT * FROM accounts;"`

See scripts for details. Migration files are located in `migrations/` directory.

## Backup and Maintenance

### Manual Backup

```bash
# Quick backup
cp stuco.db stuco.db.backup.$(date +%Y%m%d_%H%M%S)

# Backup with compression
tar -czf stuco_backup_$(date +%Y%m%d_%H%M%S).tar.gz stuco.db stuco.db-wal stuco.db-shm
```

### Database Reset

Stop the web server and all database writers first. From the repository root:

```bash
./scripts/reset_db.sh
./scps-cli users
```

The reset script backs up and replaces the root `stuco.db` after confirmation. It does not follow `DATABASE_PATH`; do not use it to reset a database at another path. Recreate your administrator with the CLI afterward.

### Migration Runner

Run migrations with automatic backup:

```bash
./scripts/run_migration.sh migrate_cascade_delete.sql
./scripts/run_migration.sh migrate_decimal_currency.sql
```

The script:
- Creates timestamped backup before migration
- Runs the SQL migration file
- Tests foreign key constraints
- Provides rollback instructions if issues occur

### Maintenance Tasks

- **Compact Database**: `sqlite3 stuco.db "VACUUM;"`
- **Integrity Check**: `sqlite3 stuco.db "PRAGMA integrity_check;"`
- **Enable WAL Mode**: `sqlite3 stuco.db "PRAGMA journal_mode=WAL;"`
- **Check Size**: `du -h stuco.db*`

### Automated Backups (Production)

Add to crontab for daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/stuco && tar --zstd -cf db_backups/auto_$(date +\%Y\%m\%d).tar.zst stuco.db*
```

### Cloud Backups with Cloudflare R2

For off-site backups to Cloudflare R2 using `rclone crypt`, so the uploaded backup objects are encrypted before they leave the host:

#### Setup

1. **Create R2 Bucket**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2
   - Create a new bucket (e.g., `stuco-db-backups`)
   - Generate API token with Object Read & Write permissions
   - Note your Account ID, Access Key ID, and Secret Access Key

2. **Install rclone**:
   ```bash
   # On Debian/Ubuntu/Raspberry Pi OS
   sudo apt update && sudo apt install rclone
   
   # Or download from official site
   curl https://rclone.org/install.sh | sudo bash
   ```

3. **Configure encrypted R2 remotes**:
   ```bash
   ./scripts/setup-r2-crypt.sh
   ```

   The helper configures:
   - raw remote: `r2`
   - encrypted remote: `r2-crypt`

4. **Optional: Set Environment Variables**:
   ```bash
   # Add to ~/.bashrc for convenience
   export RCLONE_REMOTE="r2"  # Your rclone remote name
   export RCLONE_CRYPT_REMOTE="r2-crypt"  # Encrypted remote used by backup scripts
   export R2_PATH="stuco-db-backups"  # Path within bucket for backups
   ```

#### Manual Backup

Run the backup script manually:

```bash
cd $PROJECT_ROOT
./scripts/cloud_backup_r2.sh
```

This will:
- Create a compressed backup in `db_backups/`
- Upload to Cloudflare R2
- Keep the local backup
- Display backup summary

#### Automated Daily Cloud Backups

Add to crontab for daily cloud backups:

```bash
# Edit crontab
crontab -e

# Add daily R2 backup at 2 AM
0 2 * * * cd $PROJECT_ROOT && ./scripts/cloud_backup_r2.sh >> logs/r2_backup.log 2>&1
```

If you need to specify a custom rclone remote name or path:

```bash
# With custom remote/path
0 2 * * * cd $PROJECT_ROOT && RCLONE_REMOTE=my-r2 RCLONE_CRYPT_REMOTE=my-r2-crypt R2_PATH=my-backups ./scripts/cloud_backup_r2.sh >> logs/r2_backup.log 2>&1
```

#### Restore from R2

To restore a database from R2:

```bash
# List available backups
rclone ls r2-crypt:

# Restore specific backup
./scripts/restore_from_r2.sh stuco_backup_20251110_005702.tar.zst
```

The restore script will:
- Download the backup from R2
- Create a safety backup of current database
- Extract and restore the database files

#### List and Manage R2 Backups

```bash
# List all backups with sizes
rclone ls r2-crypt:

# List with more details
rclone lsl r2-crypt:

# Download a backup without restoring
rclone copy r2-crypt:stuco_backup_20251110_005702.tar.zst db_backups/

# Check total space used
rclone size r2-crypt:

# Delete old backups (optional)
rclone delete r2-crypt:stuco_backup_20251110_005702.tar.zst

# Delete backups older than 90 days
rclone delete r2-crypt: --min-age 90d
```


## Troubleshooting

- **Locked DB**: Close other apps/scripts; increase busy_timeout.
- **Foreign Key Errors**: Ensure PRAGMA foreign_keys=ON.
- **Path Issues**: Use absolute paths in .env.local.
- **Permissions**: `chmod 666 stuco.db` if shared.

For more, see [Troubleshooting](troubleshooting.md).

## Quick Reference

**Common Commands:**
```bash
# Initialize database
sqlite3 stuco.db < migrations/schema.sql
sqlite3 stuco.db < web-next/migrations/better_auth_schema.sql

# View schema
sqlite3 stuco.db ".schema"

# List all tables
sqlite3 stuco.db ".tables"

# Query students with balances
sqlite3 stuco.db "SELECT s.name, a.balance FROM students s JOIN accounts a ON s.id = a.student_id;"

# Reset (destructive; stop all database writers first)
./scripts/reset_db.sh

# Migrations
./scripts/run_migration.sh migration_file.sql
```

**Last updated: November 12, 2025**
