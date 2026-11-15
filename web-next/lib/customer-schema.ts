import type Database from "better-sqlite3";
import { ensureUserSchema, migrateUserSchema } from "./user-schema";

const migrationCommand = "cd web-next && node --import tsx tools/migrate-customer.ts --writers-stopped";
const financialColumns = {
  cards: ["card_uid", "status", "issued_at"],
  accounts: ["balance", "max_overdraft_week"],
  transactions: ["id", "card_uid", "type", "amount", "overdraft_component", "payment_method", "description", "staff", "created_at"],
  overdraft_weeks: ["week_start_utc", "used"],
  wechat_topup_requests: ["id", "requested_amount", "payable_amount", "status", "created_by_user_id", "created_by_name", "internal_note", "review_note", "reviewed_by_user_id", "reviewed_by_name", "approved_transaction_id", "created_at", "expires_at", "claimed_at", "reviewed_at"],
};
const indexRenames = [
  ["idx_tx_student_time", "idx_tx_customer_time"],
  ["idx_transactions_student_id_created_at", "idx_transactions_customer_id_created_at"],
] as const;
interface Column { name: string; dflt_value: string | null; notnull: number; hidden: number }
interface SchemaObject { type: string; name: string; sql: string | null }
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const columns = (db: Database.Database, table: string) => db.pragma(`table_xinfo(${quote(table)})`) as Column[];
function refuse(detail: string): never {
  throw new Error(`Unsupported or mixed customer schema (${detail}). Stop writers, verify a backup, then run: ${migrationCommand}`);
}
function requireColumns(db: Database.Database, table: string, expected: readonly string[], forbidden?: string) {
  const names = columns(db, table).map(column => column.name);
  if (expected.some(name => !names.includes(name)) || (forbidden && names.includes(forbidden))) refuse(`columns in ${table}`);
}
function validateShape(db: Database.Database): "legacy" | "final" {
  const objects = db.prepare<[], SchemaObject>("SELECT type,name,sql FROM sqlite_schema").all();
  const tables = new Set(objects.filter(object => object.type === "table").map(object => object.name));
  const legacy = tables.has("students");
  if (legacy === tables.has("customers") || tables.has("user_replacement")) refuse("colliding or missing domain tables");
  const table = legacy ? "students" : "customers";
  const link = legacy ? "user_student_links" : "user_customer_links";
  const field = legacy ? "student_id" : "customer_id";
  const otherField = legacy ? "customer_id" : "student_id";
  if (!tables.has(link) || tables.has(legacy ? "user_customer_links" : "user_student_links")) refuse("colliding or missing login links");
  requireColumns(db, table, ["id", "name", "archived"]);
  for (const [name, required] of Object.entries(financialColumns)) requireColumns(db, name, [...required, field], otherField);
  requireColumns(db, link, ["user_id", field], otherField);
  requireColumns(db, "app_meta", ["key", "value"]);
  requireColumns(db, "transaction_note_history", ["id", "transaction_id", "previous_description", "new_description", "edited_by", "edited_at"]);
  requireColumns(db, "session", ["id", "userId", "token", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt"]);
  requireColumns(db, "account", ["id", "userId", "accountId", "providerId", "password", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "expiresAt", "scope", "idToken", "createdAt", "updatedAt"]);
  requireColumns(db, "verification", ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"]);
  if (!legacy) ensureUserSchema(db);
  const role = columns(db, "user").find(column => column.name === "role");
  if (legacy && role?.dflt_value === "'customer'") refuse("partially migrated roles");
  for (const name of [...Object.keys(financialColumns), link]) {
    const keys = db.pragma(`foreign_key_list(${quote(name)})`) as { from: string; table: string; to: string }[];
    if (!keys.some(key => key.from === field && key.table === table && key.to === "id")) refuse(`foreign key in ${name}`);
  }
  const uniqueLinks = db.pragma(`index_list(${quote(link)})`) as { name: string; unique: number }[];
  if (!uniqueLinks.some(index => index.unique && (db.pragma(`index_info(${quote(index.name)})`) as { name: string }[]).map(column => column.name).join(",") === field)) refuse("nonunique customer login links");
  if (!columns(db, link).some(column => column.name === "user_id") || !(db.pragma(`table_info(${quote(link)})`) as { name: string; pk: number }[]).some(column => column.name === "user_id" && column.pk === 1)) refuse("nonunique user login links");
  for (const [oldName, newName] of indexRenames) {
    if (objects.some(object => object.name === (legacy ? newName : oldName))) refuse("partially migrated indexes");
  }
  if (db.prepare("SELECT value FROM app_meta WHERE key='currency_scale'").pluck().get() !== "100") refuse("currency scale must already be cents; use the legacy converter on a copy");
  const violations = db.pragma("foreign_key_check") as unknown[];
  if (violations.length) refuse(`foreign key violations: ${JSON.stringify(violations)}`);
  return legacy ? "legacy" : "final";
}

export function assertCustomerSchema(database: Database.Database): void {
  if (validateShape(database) !== "final") refuse("legacy student domain");
}

export function migrateCustomerSchema(database: Database.Database): void {
  if (database.inTransaction) throw new Error("Customer migration must run outside a caller transaction");
  const foreignKeys = database.pragma("foreign_keys", { simple: true });
  const legacyAlter = database.pragma("legacy_alter_table", { simple: true });
  // Only the user-table rebuild requires FK enforcement disabled, before BEGIN.
  const legacy = database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='students'").get();
  if (legacy) database.pragma("foreign_keys=OFF");
  database.pragma("legacy_alter_table=OFF");
  try {
    database.transaction(() => {
      if (validateShape(database) === "final") return;
      migrateUserSchema(database);
      database.exec("ALTER TABLE students RENAME TO customers; ALTER TABLE user_student_links RENAME TO user_customer_links;");
      for (const table of [...Object.keys(financialColumns), "user_customer_links"]) database.exec(`ALTER TABLE ${quote(table)} RENAME COLUMN student_id TO customer_id`);
      for (const [oldName, newName] of indexRenames) {
        const definition = database.prepare<[string], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?").get(oldName);
        if (definition) database.exec(`DROP INDEX ${quote(oldName)}; ${definition.sql.replace(oldName, newName)}`);
      }
      assertCustomerSchema(database);
    }).immediate();
  } finally {
    database.pragma(`legacy_alter_table=${legacyAlter ? "ON" : "OFF"}`);
    database.pragma(`foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
  }
}
