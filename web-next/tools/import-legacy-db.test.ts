import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { convertLegacySnapshot, inferTopupPaymentMethod } from './import-legacy-db';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixture(scale?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-converter-'));
  const source = path.join(directory, 'source.db');
  const staged = path.join(directory, 'staged.db');
  const db = new Database(source);
  db.exec(fs.readFileSync(path.join(root, 'migrations/schema.sql'), 'utf8').replaceAll('customers', 'students').replaceAll('customer_id', 'student_id').replaceAll('user_customer_links', 'user_student_links'));
  db.exec(fs.readFileSync(path.join(root, 'web-next/migrations/better_auth_schema.sql'), 'utf8').replaceAll("'customer'", "'student'"));
  db.prepare('DELETE FROM app_meta').run();
  if (scale !== undefined) db.prepare('INSERT INTO app_meta VALUES (?,?)').run('currency_scale', scale);
  db.exec(`INSERT INTO students VALUES(7,'Archived',1),(8,'Zero',0);
    INSERT INTO accounts VALUES(7,-12,30),(8,0,0);
    INSERT INTO cards VALUES('ABCD',7,'revoked','old');
    INSERT INTO transactions VALUES(11,7,'ABCD','TOPUP',25,0,NULL,'Cash: lunch','operator','then');
    INSERT INTO overdraft_weeks VALUES(7,'week',2);
    INSERT INTO user VALUES('u','Buyer','buyer@example.test',1,NULL,'student',1,2);
    INSERT INTO user_student_links VALUES('u',7);
    INSERT INTO account(id,userId,accountId,providerId,password) VALUES('a','u','u','credential','hash');
    INSERT INTO session(id,userId,token,expiresAt) VALUES('s','u','secret',900);
    INSERT INTO wechat_topup_requests(id,student_id,requested_amount,payable_amount,status,created_by_user_id,expires_at,approved_transaction_id) VALUES(3,7,25,26,'approved','u','later',11);
    UPDATE sqlite_sequence SET seq=90 WHERE name='students';`);
  db.exec(`INSERT INTO user VALUES('staff','Staff','staff@example.test',0,NULL,'staff',3,4);
    INSERT INTO user VALUES('admin','Admin','admin@example.test',0,NULL,'admin',5,6);
    INSERT INTO transaction_note_history VALUES(12,11,'old','new','admin','edited');`);
  db.exec("CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES user(id),selected_reader TEXT,updated_at TEXT); INSERT INTO user_preferences VALUES('u','reader-2','kept')");
  db.close();
  return { directory, source, staged };
}
for (const scale of [undefined, '10', '100']) test(`preserves ledger/auth and scales marker ${scale}`, async () => {
  const f = fixture(scale);
  try {
    await convertLegacySnapshot(f.source, f.staged);
    const db = new Database(f.staged);
    try {
      const multiplier = scale === '100' ? 1 : 10;
      assert.deepEqual(db.prepare('SELECT * FROM customers ORDER BY id').all(), [{ id: 7, name: 'Archived', archived: 1 }, { id: 8, name: 'Zero', archived: 0 }]);
      assert.equal(db.prepare('SELECT balance FROM accounts WHERE customer_id=7').pluck().get(), -12 * multiplier);
      assert.equal(db.prepare('SELECT used FROM overdraft_weeks').pluck().get(), 2 * multiplier);
      assert.equal(db.prepare('SELECT payable_amount FROM wechat_topup_requests').pluck().get(), 26 * multiplier);
      assert.equal(db.prepare("SELECT role FROM user WHERE id='u'").pluck().get(), 'customer');
      assert.equal(db.prepare('SELECT password FROM account').pluck().get(), 'hash');
      assert.equal(db.prepare('SELECT token FROM session').pluck().get(), 'secret');
      assert.equal(db.prepare('SELECT customer_id FROM user_customer_links').pluck().get(), 7);
      assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='customers'").pluck().get(), 90);
      assert.equal(db.prepare('SELECT payment_method FROM transactions').pluck().get(), 'Cash');
      assert.equal(db.prepare("SELECT role FROM user WHERE id='staff'").pluck().get(), 'staff');
      assert.equal(db.prepare("SELECT role FROM user WHERE id='admin'").pluck().get(), 'admin');
      assert.equal(db.prepare('SELECT status FROM cards').pluck().get(), 'revoked');
      assert.equal(db.prepare('SELECT amount FROM transactions').pluck().get(), 25 * multiplier);
      assert.equal(db.prepare('SELECT previous_description FROM transaction_note_history').pluck().get(), 'old');
      const preferences = spawnSync(process.execPath, ['--import', 'tsx', '--eval', "console.log(JSON.stringify(require('./lib/repositories/user-preferences.ts').getUserPreferencesByUserId('u'))); require('./lib/db.ts').closeDb()"], {
        cwd: path.join(root, 'web-next'),
        env: { ...process.env, DATABASE_PATH: f.staged, NODE_ENV: 'test' },
        encoding: 'utf8',
      });
      assert.equal(preferences.status, 0, preferences.stderr);
      assert.deepEqual(JSON.parse(preferences.stdout), { user_id: 'u', selected_reader: 'reader-2', pos_default_mode: 'tap-first', updated_at: 'kept' });
      assert.equal(db.prepare("INSERT INTO customers(name) VALUES('Next')").run().lastInsertRowid, 91);
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally { db.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('preserves an existing manual POS preference during conversion', async () => {
  const f = fixture('100');
  try {
    const source = new Database(f.source);
    source.exec("ALTER TABLE user_preferences ADD COLUMN pos_default_mode TEXT NOT NULL DEFAULT 'manual'");
    source.close();
    await convertLegacySnapshot(f.source, f.staged);
    const staged = new Database(f.staged);
    try {
      assert.deepEqual(staged.prepare('SELECT * FROM user_preferences').all(), [{ user_id: 'u', selected_reader: 'reader-2', updated_at: 'kept', pos_default_mode: 'manual' }]);
    } finally { staged.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
for (const bad of ['7', 'fraction', 'overflow', 'unknown-user', 'generated-user']) test(`refuses ${bad} without changing source or existing stage`, async () => {
  const f = fixture(bad === '7' ? '7' : '10');
  const db = new Database(f.source);
  if (bad === 'fraction') db.exec('UPDATE accounts SET balance=1.5');
  if (bad === 'overflow') db.exec('UPDATE accounts SET balance=9007199254740991');
  if (bad === 'unknown-user') db.exec('ALTER TABLE user ADD COLUMN secret_data TEXT');
  if (bad === 'generated-user') db.exec("ALTER TABLE user ADD COLUMN generated_name TEXT GENERATED ALWAYS AS (name) VIRTUAL");
  db.close();
  const untouched = path.join(f.directory, 'target.db');
  fs.writeFileSync(untouched, 'untouched');
  const before = fs.readFileSync(f.source);
  try {
    await assert.rejects(convertLegacySnapshot(f.source, f.staged));
    assert.deepEqual(fs.readFileSync(f.source), before);
    assert.equal(fs.readFileSync(untouched, 'utf8'), 'untouched');
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('method inference preserves fallback text and recognizes supported methods', () => {
  for (const [text, method] of [['WeChat pay: x','WeChat'],['Alipay: x','Alipay'],['Cash: x','Cash'],['BTC: x','Bitcoin'],['Bitcoin: x','Bitcoin'],['other','WeChat']]) {
    assert.equal(inferTopupPaymentMethod(text)[0], method);
  }
  assert.deepEqual(inferTopupPaymentMethod('WeChat: reference'), ['WeChat', 'WeChat: reference']);
});

test('raw legacy rows get defaults and missing role becomes staff without promotion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-raw-'));
  const source = path.join(directory, 'source.db');
  const staged = path.join(directory, 'staged.db');
  const db = new Database(source);
  db.exec(`CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL);
    INSERT INTO students VALUES(4,'Older');
    CREATE TABLE accounts(student_id INTEGER PRIMARY KEY,balance INTEGER,max_overdraft_week INTEGER);
    INSERT INTO accounts VALUES(4,0,2);
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,image TEXT,createdAt INTEGER,updatedAt INTEGER);
    INSERT INTO user VALUES('old','Old','old@example.test',0,NULL,1,2);`);
  db.close();
  try {
    await convertLegacySnapshot(source, staged);
    const result = new Database(staged);
    try {
      assert.equal(result.prepare('SELECT role FROM user').pluck().get(), 'staff');
      assert.equal(result.prepare('SELECT archived FROM customers').pluck().get(), 0);
      assert.equal(result.prepare('SELECT max_overdraft_week FROM accounts').pluck().get(), 20);
    } finally { result.close(); }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('actual command requires stopped writers, refuses active service and preserves target on conversion failure', () => {
  const f = fixture('7');
  const target = path.join(f.directory, 'live.db');
  fs.copyFileSync(f.source, target);
  const before = fs.readFileSync(target);
  const bin = path.join(f.directory, 'bin');
  fs.mkdirSync(bin);
  const systemctl = path.join(bin, 'systemctl');
  const entrypoint = path.join(root, 'web-next/tools/import-legacy-db.ts');
  const args = ['--import', 'tsx', entrypoint, '--source', f.source, '--target', target];
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  try {
    fs.writeFileSync(systemctl, '#!/bin/sh\nprintf \"active\\\\n\"\n', { mode: 0o700 });
    const missingFlag = spawnSync(process.execPath, args, { cwd: path.join(root, 'web-next'), env, encoding: 'utf8' });
    assert.notEqual(missingFlag.status, 0);
    assert.match(missingFlag.stderr, /writers-stopped/);
    const active = spawnSync(process.execPath, [...args, '--writers-stopped'], { cwd: path.join(root, 'web-next'), env, encoding: 'utf8' });
    assert.notEqual(active.status, 0);
    assert.match(active.stderr, /stuco-web is active/);
    fs.writeFileSync(systemctl, '#!/bin/sh\nprintf \"inactive\\\\n\"\n', { mode: 0o700 });
    const invalid = spawnSync(process.execPath, [...args, '--writers-stopped'], { cwd: path.join(root, 'web-next'), env, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /currency scale/);
    assert.deepEqual(fs.readFileSync(target), before);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
