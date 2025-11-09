-- Migration to add ON DELETE CASCADE to transactions and overdraft_weeks tables
-- Run this with: sqlite3 stuco.db < migrate_cascade_delete.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Backup transactions table
CREATE TABLE transactions_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount INTEGER NOT NULL,
  overdraft_component INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO transactions_backup SELECT * FROM transactions;

-- Drop old transactions table
DROP TABLE transactions;

-- Create new transactions table with CASCADE
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
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Restore data
INSERT INTO transactions SELECT * FROM transactions_backup;

-- Drop backup
DROP TABLE transactions_backup;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_tx_student_time ON transactions(student_id, created_at);

-- Backup overdraft_weeks table
CREATE TABLE overdraft_weeks_backup (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(student_id, week_start_utc)
);

INSERT INTO overdraft_weeks_backup SELECT * FROM overdraft_weeks;

-- Drop old overdraft_weeks table
DROP TABLE overdraft_weeks;

-- Create new overdraft_weeks table with CASCADE
CREATE TABLE overdraft_weeks (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Restore data
INSERT INTO overdraft_weeks SELECT * FROM overdraft_weeks_backup;

-- Drop backup
DROP TABLE overdraft_weeks_backup;

COMMIT;

PRAGMA foreign_keys = ON;

-- Verify the changes
SELECT 'Migration completed successfully!';

