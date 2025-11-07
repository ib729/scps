import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH;
if (!dbPath) {
  throw new Error("DATABASE_PATH environment variable is not set");
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath, { verbose: console.log });
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

