import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { Command } from 'commander';
import { backupDatabase } from './sqlite-snapshot';
import { assertCustomerSchema } from '../lib/customer-schema';
import { restoreDatabase } from '../app/cli/db-commands';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
type SqliteValue = string | number | bigint | Buffer | null;
type Row = Record<string, SqliteValue>;
const renamed = (name: string) => name === 'students' ? 'customers' : name === 'user_student_links' ? 'user_customer_links' : name;
const money: Record<string, string[]> = {
  accounts: ['balance', 'max_overdraft_week'], transactions: ['amount', 'overdraft_component'],
  overdraft_weeks: ['used'], wechat_topup_requests: ['requested_amount', 'payable_amount'],
};
function initialize(db: Database.Database) {
  db.exec(fs.readFileSync(path.join(root, 'migrations/schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(root, 'web-next/migrations/better_auth_schema.sql'), 'utf8'));
}
function columns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_xinfo(${quote(table)})`) as { name: string }[]).map(row => row.name);
}
function verify(db: Database.Database) {
  assertCustomerSchema(db);
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Converted database failed SQLite integrity/foreign-key checks');
}

export function inferTopupPaymentMethod(description: string | null): [string, string | null] {
  const raw = description?.trim() ?? '';
  if (!raw) return ['WeChat', null];
  let method = 'WeChat';
  let cleaned = raw;
  if (/wechat/i.test(raw)) cleaned = raw.replace(/^\s*wechat(?:\s+pay)?(?:\s+to\s+[^\n.]+)?[\s.:,-]*/i, '');
  else if (/alipay/i.test(raw)) { method = 'Alipay'; cleaned = raw.replace(/^\s*alipay[\s.:,-]*/i, ''); }
  else if (/cash/i.test(raw)) { method = 'Cash'; cleaned = raw.replace(/^\s*cash[\s.:,-]*/i, ''); }
  else if (/bitcoin|\bbtc\b/i.test(raw)) { method = 'Bitcoin'; cleaned = raw.replace(/^\s*(?:bitcoin|btc)[\s.:,-]*/i, ''); }
  // The historical WeChat fallback intentionally retains the original reference text.
  return [method, method === 'WeChat' ? raw : cleaned.replace(/^[\s.:,-]+|[\s.:,-]+$/g, '') || null];
}
function amount(value: SqliteValue, multiplier: bigint): bigint {
  if (typeof value !== 'bigint' && (typeof value !== 'number' || !Number.isSafeInteger(value))) throw new Error('Unsafe or fractional legacy currency amount');
  const result = BigInt(value) * multiplier;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Legacy currency amount overflows safe cents');
  return result;
}

/** Reads a consistent source snapshot; publishes only a completely validated new staged file. */
export async function convertLegacySnapshot(sourcePath: string, stagedPath: string): Promise<void> {
  if (fs.existsSync(stagedPath)) throw new Error('Staged destination already exists');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scps-legacy-'));
  let source: Database.Database | undefined;
  let target: Database.Database | undefined;
  try {
    const snapshot = path.join(directory, 'source.db');
    const converted = path.join(directory, 'converted.db');
    await backupDatabase(sourcePath, snapshot);
    source = new Database(snapshot, { readonly: true, fileMustExist: true });
    source.defaultSafeIntegers(true);
    const input = source;
    const tables = input.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
    if (tables.includes('students') === tables.includes('customers')) throw new Error('Missing or colliding legacy financial domain');
    const marker = tables.includes('app_meta') ? input.prepare("SELECT value FROM app_meta WHERE key='currency_scale'").pluck().get() : undefined;
    if (marker !== undefined && marker !== '10' && marker !== '100' && marker !== 10n && marker !== 100n) throw new Error(`Unsupported currency scale: ${String(marker)}`);
    const multiplier = marker === '100' || marker === 100n ? 1n : 10n;
    target = new Database(converted);
    initialize(target);
    target.pragma('foreign_keys=OFF');
    const output = target;
    output.transaction(() => {
      for (const table of tables) {
        const destination = renamed(table);
        if (destination === 'user_preferences' && !columns(output, destination).length) {
          const schema = input.prepare<[string], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table);
          if (!schema) throw new Error('Missing user preferences definition');
          output.exec(schema.sql);
        }
        const allowed = columns(output, destination);
        if (!allowed.length) throw new Error(`Unsupported legacy table: ${table}`);
        const original = columns(input, table);
        const names = original.map(name => name === 'student_id' ? 'customer_id' : name);
        if (new Set(names).size !== names.length || names.some(name => !allowed.includes(name))) throw new Error(`Unknown or colliding legacy columns in ${table}`);
        if (table === 'user' && !original.includes('role')) names.push('role');
        const insert = output.prepare(`INSERT INTO ${quote(destination)} (${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')})`);
        for (const row of input.prepare<[], Row>(`SELECT * FROM ${quote(table)}`).iterate()) {
          if (table === 'app_meta' && row.key === 'currency_scale') continue;
          const convertedRow: Row = {};
          original.forEach((name, index) => { convertedRow[names[index]] = row[name]; });
          for (const field of money[destination] ?? []) {
            if (field in convertedRow) convertedRow[field] = amount(convertedRow[field], multiplier);
          }
          if (table === 'user') convertedRow.role = !original.includes('role') ? 'staff' : ['admin', 'staff', 'customer'].includes(String(row.role)) ? row.role : 'customer';
          if (destination === 'transactions' && row.type === 'TOPUP' && (row.payment_method === undefined || row.payment_method === null || row.payment_method === '')) {
            const [method, description] = inferTopupPaymentMethod(row.description === null || row.description === undefined ? null : String(row.description));
            convertedRow.payment_method = method;
            convertedRow.description = description;
          }
          // Old schemas omit optional columns: allow final defaults, but include inferred fields.
          const rowNames = Object.keys(convertedRow);
          if (rowNames.length === names.length) insert.run(...names.map(name => convertedRow[name]));
          else output.prepare(`INSERT INTO ${quote(destination)} (${rowNames.map(quote).join(',')}) VALUES (${rowNames.map(() => '?').join(',')})`).run(...rowNames.map(name => convertedRow[name]));
        }
      }
      if (input.prepare("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").get()) {
        for (const sequence of input.prepare<[], { name: string; seq: bigint }>('SELECT name,seq FROM sqlite_sequence').all()) {
          const name = renamed(sequence.name);
          const current = output.prepare<[string], { seq: bigint }>('SELECT seq FROM sqlite_sequence WHERE name=?').safeIntegers(true).get(name);
          if (!columns(output, name).includes('id')) throw new Error(`Unsupported sequence: ${name}`);
          if (!current) output.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(name, sequence.seq);
          else if (sequence.seq > current.seq) output.prepare('UPDATE sqlite_sequence SET seq=? WHERE name=?').run(sequence.seq, name);
        }
      }
      verify(output);
    }).immediate();
    target.close(); target = undefined;
    await backupDatabase(converted, stagedPath);
  } finally {
    source?.close(); target?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function importLegacyDatabase(sourcePath: string, targetPath: string, writersStopped: boolean): Promise<string | null> {
  if (!writersStopped) throw new Error('--writers-stopped is required; this cannot detect arbitrary external writers');
  const state = execFileSync('systemctl', ['show', 'stuco-web', '--property=ActiveState', '--value'], { encoding: 'utf8' }).trim();
  if (!['inactive', 'failed'].includes(state)) throw new Error(`Refusing import while stuco-web is ${state || 'unknown'}`);
  const sourceStat = fs.statSync(sourcePath);
  if (fs.existsSync(targetPath)) {
    const targetStat = fs.statSync(targetPath);
    if (sourceStat.ino === targetStat.ino && sourceStat.dev === targetStat.dev) throw new Error('Source and target must be different files');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scps-import-'));
  try {
    const staged = path.join(directory, 'final.db');
    await convertLegacySnapshot(sourcePath, staged);
    let backup: string | null = null;
    if (fs.existsSync(targetPath)) {
      const backups = path.join(root, 'db_backups');
      fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
      backup = path.join(backups, `stuco_pre_import_${Date.now()}_${process.pid}.db`);
      await backupDatabase(targetPath, backup);
    } else {
      const fd = fs.openSync(targetPath, 'wx', 0o600);
      fs.closeSync(fd);
      const fresh = new Database(targetPath);
      try { initialize(fresh); } finally { fresh.close(); }
    }
    const active = new Database(targetPath, { fileMustExist: true });
    try { await restoreDatabase(staged, targetPath, active); } finally { active.close(); }
    return backup;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = new Command().description('Convert a legacy database; cannot detect arbitrary external writers')
    .option('--source <path>', 'Legacy source', path.join(root, 'IMPORTTHIS/stuco.db'))
    .option('--target <path>', 'Target database', path.join(root, 'stuco.db'))
    .requiredOption('--writers-stopped', 'Confirm all database writers are stopped');
  command.parse();
  const options = command.opts<{ source: string; target: string; writersStopped: boolean }>();
  importLegacyDatabase(path.resolve(options.source), path.resolve(options.target), options.writersStopped).then(backup => {
    console.log('Legacy database import complete.');
    if (backup) console.log(`Backup: ${backup}`);
  }).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
