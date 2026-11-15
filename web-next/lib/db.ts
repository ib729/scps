import fs from "node:fs";

import Database from "better-sqlite3";
import { DEFAULT_NFC_READER, DEFAULT_POS_MODE } from "./pos-preferences";
import { ensureUserSchema } from "./user-schema.cjs";

import { resolveDatabasePath } from "./database-path.cjs";
import { ensureCurrencyScale } from "./currency-scale.cjs";

export const dbPath = resolveDatabasePath();
if (!fs.existsSync(dbPath)) {
  throw new Error(`SQLite database not found at ${dbPath}. Set DATABASE_PATH or place stuco.db in the project root.`);
}

let db: Database.Database | null = null;

function hasColumn(database: Database.Database, tableName: string, columnName: string) {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}


function ensureApplicationSchema(database: Database.Database) {
  ensureUserSchema(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_note_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      previous_description TEXT,
      new_description TEXT,
      edited_by TEXT,
      edited_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      selected_reader TEXT NOT NULL DEFAULT '${DEFAULT_NFC_READER}' CHECK(selected_reader IN ('reader-1', 'reader-2')),
      pos_default_mode TEXT NOT NULL DEFAULT '${DEFAULT_POS_MODE}' CHECK(pos_default_mode IN ('tap-first', 'manual')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wechat_topup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      requested_amount INTEGER NOT NULL,
      payable_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
      created_by_user_id TEXT NOT NULL,
      created_by_name TEXT,
      internal_note TEXT,
      review_note TEXT,
      reviewed_by_user_id TEXT,
      reviewed_by_name TEXT,
      approved_transaction_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      claimed_at TEXT,
      reviewed_at TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT,
      FOREIGN KEY(approved_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    );
  `);

  if (!hasColumn(database, "students", "archived")) {
    try {
      database.exec(`
        ALTER TABLE students
        ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      `);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name: archived")
      ) {
        throw error;
      }
    }
  }


  if (!hasColumn(database, "transactions", "payment_method")) {
    try {
      database.exec(`
        ALTER TABLE transactions
        ADD COLUMN payment_method TEXT;
      `);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name: payment_method")
      ) {
        throw error;
      }
    }
  }

  if (!hasColumn(database, "wechat_topup_requests", "claimed_at")) {
    try {
      database.exec(`
        ALTER TABLE wechat_topup_requests
        ADD COLUMN claimed_at TEXT;
      `);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name: claimed_at")
      ) {
        throw error;
      }
    }
  }

  ensureCurrencyScale(database);

  database.exec(`
    UPDATE transactions
    SET payment_method = TRIM(description)
    WHERE
      type = 'TOPUP'
      AND (payment_method IS NULL OR TRIM(payment_method) = '')
      AND description IS NOT NULL
      AND TRIM(description) <> '';

    UPDATE transactions
    SET payment_method = 'WeChat'
    WHERE
      type = 'TOPUP'
      AND (payment_method IS NULL OR TRIM(payment_method) = '');

    UPDATE transactions
    SET payment_method = 'Balance'
    WHERE
      type = 'DEBIT'
      AND (payment_method IS NULL OR TRIM(payment_method) = '');
  `);

  try {
    const legacyUsersTableExists = database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = 'users'
          LIMIT 1
        `,
      )
      .get();

    if (legacyUsersTableExists) {
      const legacyUsersCount = database
        .prepare("SELECT COUNT(*) AS count FROM users")
        .get() as { count: number };

      if (legacyUsersCount.count === 0) {
        database.exec(`
          DROP TABLE users;
          DELETE FROM sqlite_sequence WHERE name = 'users';
        `);
      }
    }
  } catch (error) {
    console.warn("Skipping legacy users table cleanup:", error);
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at_id
    ON transactions(created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
    ON transactions(type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_student_id_created_at
    ON transactions(student_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transaction_note_history_transaction_id_edited_at
    ON transaction_note_history(transaction_id, edited_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_wechat_topup_requests_status_expires_at
    ON wechat_topup_requests(status, expires_at);

    CREATE INDEX IF NOT EXISTS idx_wechat_topup_requests_created_at
    ON wechat_topup_requests(created_at DESC, id DESC);
  `);

  database.transaction(() => {
    database.exec("UPDATE wechat_topup_requests SET status='expired',reviewed_at=datetime('now') WHERE status='pending' AND claimed_at IS NULL AND expires_at<=datetime('now')");
    const conflicts = database.prepare("SELECT payable_amount,group_concat(id) AS request_ids FROM wechat_topup_requests WHERE status='pending' GROUP BY payable_amount HAVING COUNT(*)>1").all();
    if (conflicts.length) throw new Error(`Conflicting pending payment amounts; reconcile a backup before starting SCPS: ${JSON.stringify(conflicts)}`);
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_topup_requests_pending_payable ON wechat_topup_requests(payable_amount) WHERE status='pending'");
  }).immediate();

}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    });
    try {
      db.pragma("foreign_keys = ON");
      ensureApplicationSchema(db);
    } catch (error) {
      db.close();
      db = null;
      throw error;
    }
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
