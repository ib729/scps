PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- 1. Recreate transactions table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS transactions_new (
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

INSERT INTO transactions_new (
  id,
  student_id,
  card_uid,
  type,
  amount,
  overdraft_component,
  payment_method,
  description,
  staff,
  created_at
)
SELECT
  id,
  student_id,
  card_uid,
  type,
  amount,
  overdraft_component,
  NULL,
  description,
  staff,
  created_at
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_tx_student_time
  ON transactions(student_id, created_at);

-- 2. Recreate overdraft_weeks table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS overdraft_weeks_new (
  student_id INTEGER NOT NULL,
  week_start_utc TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,               -- cents of CNY used this week, e.g., 550 = ¥5.50
  PRIMARY KEY(student_id, week_start_utc),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT
);

INSERT INTO overdraft_weeks_new SELECT * FROM overdraft_weeks;

DROP TABLE overdraft_weeks;

ALTER TABLE overdraft_weeks_new RENAME TO overdraft_weeks;

COMMIT;

PRAGMA foreign_keys=ON;
