# Database Connection Guide

## Overview

The web UI connects to your existing SQLite database at:
```
/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db
```

## Current Database Status

✅ **Database is properly connected and working!**

Your database contains:
- **3 students**: Alice Zhang, Doggo, Edward Snowden
- **3 accounts** with balances
- **9 transactions** recorded
- All required tables: students, cards, accounts, transactions, overdraft_weeks

## How It Works

### 1. Environment Configuration

The database path is set in `.env.local`:
```
DATABASE_PATH=/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db
```

### 2. Database Layer

The app uses `better-sqlite3` for database access:
- `lib/db.ts` - Database connection management
- `lib/repositories/` - Typed data access layer for each table

### 3. Server Actions

All database operations happen server-side through Next.js server actions:
- `app/actions/students.ts` - Student CRUD
- `app/actions/cards.ts` - Card management
- `app/actions/accounts.ts` - Account updates
- `app/actions/transactions.ts` - Transaction history
- `app/actions/pos.ts` - Point of sale
- `app/actions/topup.ts` - Top-up operations

## Testing the Connection

Run the test script to verify everything works:

```bash
cd web-next
node test-db.js
```

Expected output:
```
Testing database connection...
Database path: /Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db

✅ Database connected successfully!

📋 Tables: students, sqlite_sequence, cards, accounts, transactions, overdraft_weeks

👥 Students: 3
  - Alice Zhang (ID: 1, Balance: ¥14)
  - Doggo (ID: 2, Balance: ¥52)
  - Edward Snowden (ID: 3, Balance: ¥45)

💰 Transactions: 9

✅ All checks passed!
```

## Important Notes

### 1. better-sqlite3 Native Bindings

The `better-sqlite3` package requires native compilation for your platform (macOS ARM64).

**First-time setup:**
```bash
./setup.sh
```

This automatically builds the native bindings.

### 2. Database Migrations

The web UI uses the **same database** as your Python scripts. It reads from and writes to:
```
/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db
```

**No migration needed!** The web UI works with your existing schema.

### 3. Foreign Keys

Foreign key constraints are enabled:
```typescript
db.pragma("foreign_keys = ON");
```

This ensures referential integrity (e.g., deleting a student cascades to accounts, cards, transactions).

## Compatibility with Python Scripts

The web UI is fully compatible with your existing Python scripts:

| Python Script | Web UI Equivalent |
|--------------|------------------|
| `enroll.py` | Students page → Add Student |
| `pos.py` | POS page |
| `topup.py` | Top-up page |
| All scripts | Transaction history in web UI |

**You can use both interchangeably!** Changes made in the web UI will be visible in Python scripts and vice versa.

## Schema Alignment

The web UI mirrors your database schema exactly:

### Students Table
```sql
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
)
```
✅ Accessed via `lib/repositories/students.ts`

### Cards Table
```sql
CREATE TABLE cards (
  card_uid TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
)
```
✅ Accessed via `lib/repositories/cards.ts`

### Accounts Table
```sql
CREATE TABLE accounts (
  student_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  max_overdraft_week INTEGER NOT NULL DEFAULT 20,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
)
```
✅ Accessed via `lib/repositories/accounts.ts`

### Transactions Table
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount INTEGER NOT NULL,
  overdraft_component INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id)
)
```
✅ Accessed via `lib/repositories/transactions.ts`

### Overdraft Weeks Table
```sql
CREATE TABLE overdraft_weeks (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id)
)
```
✅ Accessed via `lib/repositories/overdraft.ts`

## Troubleshooting

### "Could not locate the bindings file"

**Problem**: better-sqlite3 native bindings not built

**Solution**:
```bash
./setup.sh
```

Or manually:
```bash
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd ../../../../..
```

### Database Locked

**Problem**: SQLite database is locked by another process

**Solution**: Close any other connections (Python scripts, sqlite3 CLI, etc.)

### Permission Denied

**Problem**: Can't access database file

**Solution**: Check file permissions:
```bash
ls -l "/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db"
```

Should be readable and writable.

## Next Steps

1. ✅ Database is connected and verified
2. ✅ Native bindings are built
3. ✅ Test script confirms everything works
4. 🚀 Start the dev server: `pnpm dev`
5. 🌐 Open http://localhost:3000

Enjoy your new web interface! 🎉

