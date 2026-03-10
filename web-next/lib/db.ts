import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

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
    SET payment_method = 'Unspecified'
    WHERE
      type = 'TOPUP'
      AND (payment_method IS NULL OR TRIM(payment_method) = '');
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at_id
    ON transactions(created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
    ON transactions(type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_student_id_created_at
    ON transactions(student_id, created_at DESC);
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
