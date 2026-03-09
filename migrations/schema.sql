PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  archived INTEGER NOT NULL DEFAULT 0
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
  balance INTEGER NOT NULL DEFAULT 0,             -- cents of CNY, e.g., 550 = ¥5.50
  max_overdraft_week INTEGER NOT NULL DEFAULT 0, -- cents of CNY, e.g., 2000 = ¥20.00/week
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount INTEGER NOT NULL,                        -- + for topup/adjust, - for debit; cents of CNY, e.g., 550 = ¥5.50
  overdraft_component INTEGER NOT NULL DEFAULT 0, -- part of a DEBIT taken from the weekly overpay; cents of CNY
  payment_method TEXT,
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC ISO-ish
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT
);

-- Track weekly overpay usage per student, keyed by the Monday 00:00 (Asia/Shanghai) converted to UTC
CREATE TABLE IF NOT EXISTS overdraft_weeks (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,               -- cents of CNY used this week, e.g., 550 = ¥5.50
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO app_meta(key, value) VALUES ('currency_scale', '100');

CREATE INDEX IF NOT EXISTS idx_tx_student_time
  ON transactions(student_id, created_at);

-- Staff user accounts
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
