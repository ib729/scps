import fs from "node:fs";

import Database from "better-sqlite3";
import { DEFAULT_NFC_READER, DEFAULT_POS_MODE } from "./pos-preferences";
import { assertCustomerSchema } from "./customer-schema";

import { resolveDatabasePath } from "./database-path";

export const dbPath = resolveDatabasePath();

let db: Database.Database | null = null;

function ensureApplicationSchema(database: Database.Database) {
  assertCustomerSchema(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      selected_reader TEXT NOT NULL DEFAULT '${DEFAULT_NFC_READER}' CHECK(selected_reader IN ('reader-1', 'reader-2')),
      pos_default_mode TEXT NOT NULL DEFAULT '${DEFAULT_POS_MODE}' CHECK(pos_default_mode IN ('tap-first', 'manual')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at_id
    ON transactions(created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
    ON transactions(type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_customer_id_created_at
    ON transactions(customer_id, created_at DESC);

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
    if (!fs.existsSync(dbPath)) {
      throw new Error(`SQLite database not found at ${dbPath}. Set DATABASE_PATH or place scps.db in the project root.`);
    }
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
