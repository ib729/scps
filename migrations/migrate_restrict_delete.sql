PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- 1. Recreate transactions table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  card_uid TEXT,
  type TEXT NOT NULL CHECK (type IN ('TOPUP','DEBIT','ADJUST')),
  amount INTEGER NOT NULL,                       -- + for topup/adjust, - for debit; tenths of CNY, e.g., 55 = ¥5.5
  overdraft_component INTEGER NOT NULL DEFAULT 0,-- part of a DEBIT taken from the weekly overpay; tenths of CNY
  description TEXT,
  staff TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC ISO-ish
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT
);

INSERT INTO transactions_new SELECT * FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_tx_student_time
  ON transactions(student_id, created_at);

-- 2. Recreate overdraft_weeks table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS overdraft_weeks_new (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,               -- tenths of CNY used this week, e.g., 55 = ¥5.5
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT
);

INSERT INTO overdraft_weeks_new SELECT * FROM overdraft_weeks;

DROP TABLE overdraft_weeks;

ALTER TABLE overdraft_weeks_new RENAME TO overdraft_weeks;

COMMIT;

PRAGMA foreign_keys=ON;