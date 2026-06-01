import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { DEFAULT_NFC_READER, DEFAULT_POS_MODE } from "./pos-preferences";

const envDbPath = process.env.DATABASE_PATH?.trim();
const fallbackDbLocations = [
  path.resolve(process.cwd(), "stuco.db"),
  path.resolve(process.cwd(), "..", "stuco.db"),
];

const dbPathCandidates = envDbPath
  ? [envDbPath]
  : fallbackDbLocations;

const dbPath = dbPathCandidates.find((candidate) => fs.existsSync(candidate));

if (!dbPath) {
  const triedPaths = envDbPath ? dbPathCandidates : fallbackDbLocations;
  throw new Error(
    `SQLite database not found. ${envDbPath ? "DATABASE_PATH points to a missing file" : "Set DATABASE_PATH or place stuco.db in the project root"} (looked in ${triedPaths.join(
      ", ",
    )}).`,
  );
}

let db: Database.Database | null = null;

function hasColumn(database: Database.Database, tableName: string, columnName: string) {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

function getMeta(database: Database.Database, key: string): string | null {
  const row = database
    .prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1")
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

function setMeta(database: Database.Database, key: string, value: string) {
  database
    .prepare(
      `
        INSERT INTO app_meta(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    )
    .run(key, value);
}

function ensureApplicationSchema(database: Database.Database) {
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

  if (!hasColumn(database, "user", "role")) {
    try {
      database.exec(`
        ALTER TABLE user
        ADD COLUMN role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff'));
      `);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name: role")
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

  if (!getMeta(database, "currency_scale")) {
    const totals = database
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM accounts) AS accountCount,
            (SELECT COUNT(*) FROM transactions) AS transactionCount,
            (SELECT COUNT(*) FROM overdraft_weeks) AS overdraftCount
        `,
      )
      .get() as {
      accountCount: number;
      transactionCount: number;
      overdraftCount: number;
    };

    if (totals.accountCount > 0 || totals.transactionCount > 0 || totals.overdraftCount > 0) {
      const migrateCurrencyScale = database.transaction(() => {
        database.exec(`
          UPDATE accounts SET balance = balance * 10;
          UPDATE accounts SET max_overdraft_week = max_overdraft_week * 10;
          UPDATE transactions SET amount = amount * 10;
          UPDATE transactions SET overdraft_component = overdraft_component * 10;
          UPDATE overdraft_weeks SET used = used * 10;
        `);
      });

      migrateCurrencyScale();
    }

    setMeta(database, "currency_scale", "100");
  }

  database.exec(`
    UPDATE user
    SET role = 'staff'
    WHERE role IS NULL OR role NOT IN ('admin', 'staff');

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

  const adminCount = database
    .prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count === 0) {
    const bootstrapAdmin = database
      .prepare(
        `
          SELECT id
          FROM user
          ORDER BY createdAt ASC
          LIMIT 1
        `,
      )
      .get() as { id: string } | undefined;

    if (bootstrapAdmin) {
      database
        .prepare("UPDATE user SET role = 'admin' WHERE id = ?")
        .run(bootstrapAdmin.id);
    }
  }
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    });
    db.pragma("foreign_keys = ON");
    ensureApplicationSchema(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
