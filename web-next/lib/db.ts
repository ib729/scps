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

function ensureSecuritySchema(database: Database.Database) {
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

  database.exec(`
    UPDATE user
    SET role = 'staff'
    WHERE role IS NULL OR role NOT IN ('admin', 'staff');
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);

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
    ensureSecuritySchema(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
