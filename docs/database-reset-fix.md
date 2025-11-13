# Database Reset Fix - Better Auth Tables

## Problem
When resetting the database using `init_db.py`, `reset_db.py`, or `scripts/reset_db.sh`, the Better Auth tables were not being created, causing "Failed to sign up" errors.

## Root Cause
The database initialization scripts only loaded `migrations/schema.sql`, which contains the main application tables (students, cards, accounts, etc.) but not the Better Auth tables (user, session, account, verification).

## Solution Applied
Updated all database initialization scripts to automatically include Better Auth schema:

### Files Modified
1. **`init_db.py`** - Added Better Auth schema loading
2. **`reset_db.py`** - Added Better Auth schema to initialize_database()
3. **`scripts/reset_db.sh`** - Added Better Auth migration step

### Documentation Updated
1. **`docs/getting-started.md`** - Updated Database Setup section to mention Better Auth tables
2. **`docs/authentication.md`** - Clarified that Better Auth tables are now automatic
3. **`docs/troubleshooting.md`** - Updated signup code troubleshooting and added "Failed to sign up" section

## How It Works Now
When you run any of these commands:
```bash
python init_db.py
python reset_db.py
./scripts/reset_db.sh
```

They will automatically:
1. Create main tables from `migrations/schema.sql`
2. Create Better Auth tables from `web-next/migrations/better_auth_schema.sql`
3. Print confirmation that both schemas were applied

## Verification
After any database reset, verify all tables exist:
```bash
sqlite3 stuco.db ".tables"
```

Should include: `account`, `session`, `user`, `verification` (Better Auth) plus your application tables.

## Environment Variable Fix
Also fixed the signup code issue:
- The `SIGNUP_CODE` environment variable in `web-next/.env.local` should NOT have quotes
- Correct: `SIGNUP_CODE=Xn0tj#9y`
- Wrong: `SIGNUP_CODE="Xn0tj#9y"`

After changing environment variables, always restart the web server:
```bash
sudo systemctl restart stuco-web
```

## Date Applied
November 13, 2025

