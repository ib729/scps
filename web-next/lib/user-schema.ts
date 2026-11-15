import type Database from 'better-sqlite3';

interface UserColumn {
  name: string;
  dflt_value: string | null;
  notnull: number;
  hidden: number;
}
const columns = ['id', 'name', 'email', 'emailVerified', 'image', 'role', 'createdAt', 'updatedAt'];

function validateColumns(database: Database.Database, requireRole: boolean): UserColumn[] {
  const actual = database.pragma('table_xinfo(user)') as UserColumn[];
  const unexpected = actual.filter(column => !columns.includes(column.name) || column.hidden !== 0);
  const missing = columns.filter(name => (requireRole || name !== 'role') && !actual.some(column => column.name === name));
  if (unexpected.length || missing.length) throw new Error(`Unsupported user schema columns (unexpected: ${unexpected.map(column => column.name).join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`);
  return actual;
}

export function ensureUserSchema(database: Database.Database): void {
  const actual = validateColumns(database, true);
  const role = actual.find(column => column.name === 'role');
  const sql = database.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='table' AND name='user'").get()?.sql;
  const values = sql?.match(/CHECK\s*\(\s*role\s+IN\s*\(([^)]+)\)\s*\)/i)?.[1].split(',').map(value => value.trim()).sort();
  if (role?.dflt_value !== "'customer'" || role.notnull !== 1 || values?.join(',') !== "'admin','customer','staff'") throw new Error('Legacy or mixed user schema; run node --import tsx tools/migrate-customer.ts --writers-stopped');
  if (database.prepare("SELECT 1 FROM user WHERE role NOT IN ('admin','staff','customer') OR role IS NULL LIMIT 1").get()) throw new Error('Invalid customer role in user schema');
}

export function migrateUserSchema(database: Database.Database): void {
  if (!database.inTransaction || database.pragma('foreign_keys', { simple: true })) throw new Error('User rebuild requires the customer migration transaction with foreign keys disabled');
  const actual = validateColumns(database, false);
  const objects = database.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE tbl_name='user' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  database.exec(`CREATE TABLE user_replacement (
    id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,emailVerified INTEGER DEFAULT 0,image TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','staff','customer')),
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  const role = actual.some(column => column.name === 'role') ? "CASE WHEN role IN ('admin','staff') THEN role ELSE 'customer' END" : "'staff'";
  database.exec(`INSERT INTO user_replacement (${columns.join(',')}) SELECT id,name,email,emailVerified,image,${role},createdAt,updatedAt FROM user; DROP TABLE user; ALTER TABLE user_replacement RENAME TO user;`);
  for (const object of objects) database.exec(object.sql);
}
