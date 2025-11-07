PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cards (
  card_uid TEXT PRIMARY KEY,              -- hex UID or your own token
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active|revoked
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  student_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,                 -- <-- renamed, stores fen (cents)
  max_overdraft_week_fen INTEGER NOT NULL DEFAULT 2000,  -- ¥20/week
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount_fen INTEGER NOT NULL,                 -- + for topup, - for debit
  overdraft_component_fen INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC
  FOREIGN KEY(student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS overdraft_weeks (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,     -- Monday 00:00 America/New_York, converted to UTC
  used_fen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_tx_student_time
  ON transactions(student_id, created_at);

