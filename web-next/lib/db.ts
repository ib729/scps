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
