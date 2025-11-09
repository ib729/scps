# Database Guide

The system uses a single SQLite database (`stuco.db`) shared between CLI tools and web UI. This guide covers schema, connections, and migrations.

## Schema

The database is initialized with `python init_db.py`, which runs `schema.sql`.

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

-- Staff users (future auth)
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
cd web-next
node test-db.js
```

Outputs tables, student count, balances, transactions.

### Compatibility

- CLI and web share the DB; changes sync immediately.
- WAL mode allows concurrent reads/writes.
- No migrations needed for basic use; schema matches.

## Migrations

Migrations update existing DBs. Run with `./run_migration.sh <script.sql>` (backs up first).

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
   ./run_migration.sh migrate_cascade_delete.sql
   ./run_migration.sh migrate_decimal_currency.sql
   ```

3. Verify: `sqlite3 stuco.db "SELECT * FROM accounts;"`

See scripts for details.

## Backup and Maintenance

- **Backup**: `cp stuco.db stuco.db.backup.$(date +%Y%m%d_%H%M%S)`
- **Size**: Compact with `sqlite3 stuco.db "VACUUM;"`
- **Integrity**: `sqlite3 stuco.db "PRAGMA integrity_check;"`
- **Concurrent Access**: Use WAL: `sqlite3 stuco.db "PRAGMA journal_mode=WAL;"`
- **Production**: Automate backups (cron), monitor locks.

## Troubleshooting

- **Locked DB**: Close other apps/scripts; increase busy_timeout.
- **Foreign Key Errors**: Ensure PRAGMA foreign_keys=ON.
- **Path Issues**: Use absolute paths in .env.local.
- **Permissions**: `chmod 666 stuco.db` if shared.

For more, see [Troubleshooting](troubleshooting.md).

**Updated**: November 2025 (Post-Migrations)
