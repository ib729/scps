import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const web = path.resolve(import.meta.dirname, "..");
const tool = path.join(web, "tools/batch-import-customers.ts");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps customer csv "));
  const filename = path.join(directory, "ledger with spaces.db");
  const csv = path.join(directory, "customers with spaces.csv");
  const db = new Database(filename);
  db.exec(fs.readFileSync(path.join(web, "../migrations/schema.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
  db.close();
  const run = (args: string[] = [], cwd = web, standalone = false) => {
    const command = standalone
      ? ["--import", loader, tool, ...args, csv]
      : ["--import", loader, "--input-type=module", "--eval", `import { importCustomers } from ${JSON.stringify(pathToFileURL(tool).href)}; process.exitCode = await importCustomers(process.argv[1], { skipDuplicates: !process.argv.includes('--no-skip-duplicates'), dryRun: process.argv.includes('--dry-run') }) ? 0 : 1;`, csv, ...args];
    return spawnSync(process.execPath, command, {
      cwd,
      env: { ...process.env, DATABASE_PATH: path.relative(web, filename) },
      encoding: "utf8",
      timeout: 15_000,
    });
  };
  return { directory, filename, csv, run };
}

test("quoted multiline names, uppercase cards and zero accounts import through the exported consumer", () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.csv, 'name,uid\r\n"  Doe, Jane  ",deadbeef\r\n" Alice\nJohnson ",0e39e996\r\nNo Card,\r\n');
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const db = new Database(f.filename, { readonly: true });
    try {
      assert.deepEqual(db.prepare("SELECT name FROM customers ORDER BY id").pluck().all(), ["Doe, Jane", "Alice\nJohnson", "No Card"]);
      assert.deepEqual(db.prepare("SELECT balance,max_overdraft_week FROM accounts ORDER BY customer_id").all(), [
        { balance: 0, max_overdraft_week: 0 }, { balance: 0, max_overdraft_week: 0 }, { balance: 0, max_overdraft_week: 0 },
      ]);
      assert.deepEqual(db.prepare("SELECT card_uid,status FROM cards ORDER BY customer_id").all(), [
        { card_uid: "DEADBEEF", status: "active" }, { card_uid: "0E39E996", status: "active" },
      ]);
    } finally { db.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("duplicate names attach cards atomically but a conflicting UID fails before creating another customer", () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.csv, "name,uid\nOwner,DEADBEEF\nOwner,ABCD\nOwner,ABCD\nIntruder,DEADBEEF\nOther,1234\nOwner,1234\n");
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Row 5.*DEADBEEF/);
    assert.match(result.stderr, /Row 7.*1234/);
    const db = new Database(f.filename, { readonly: true });
    try {
      assert.deepEqual(db.prepare("SELECT name FROM customers ORDER BY id").pluck().all(), ["Owner", "Other"]);
      assert.deepEqual(db.prepare("SELECT c.card_uid,u.name FROM cards c JOIN customers u ON u.id=c.customer_id ORDER BY c.card_uid").all(), [
        { card_uid: "1234", name: "Other" }, { card_uid: "ABCD", name: "Owner" }, { card_uid: "DEADBEEF", name: "Owner" },
      ]);
    } finally { db.close(); }
    fs.writeFileSync(f.csv, "name\nOwner\nNew Name\n");
    assert.equal(f.run(["--no-skip-duplicates"]).status, 1);
    const final = new Database(f.filename, { readonly: true });
    try { assert.equal(final.prepare("SELECT count(*) FROM customers WHERE name='New Name'").pluck().get(), 1); }
    finally { final.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("a failed card insert rolls back its customer and account while later rows still commit", () => {
  const f = fixture();
  try {
    const setup = new Database(f.filename);
    setup.exec("CREATE TRIGGER reject_card BEFORE INSERT ON cards WHEN NEW.card_uid='DEAD' BEGIN SELECT RAISE(ABORT, 'card rejected'); END;");
    setup.close();
    fs.writeFileSync(f.csv, "name,uid\nRollback,DEAD\nSurvivor,BEEF\n");
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Row 2.*card rejected/);
    const db = new Database(f.filename, { readonly: true });
    try {
      assert.deepEqual(db.prepare("SELECT name FROM customers").pluck().all(), ["Survivor"]);
      assert.equal(db.prepare("SELECT count(*) FROM accounts").pluck().get(), 1);
      assert.deepEqual(db.pragma("foreign_key_check"), []);
    } finally { db.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("validation failures continue to later valid rows and standalone CLI exits nonzero", () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.csv, "name,uid\n,DEAD\nBad Hex,GGGG\nToo Short,ABC\nToo Long,123456789012345678901\nWrong Columns,ABCD,extra\nValid,ABCD\n");
    const result = f.run([], web, true);
    assert.equal(result.status, 1, result.stderr);
    for (const row of [2, 3, 4, 5, 6]) assert.match(result.stderr, new RegExp(`Row ${row}\\b`));
    const db = new Database(f.filename, { readonly: true });
    try { assert.deepEqual(db.prepare("SELECT name FROM customers").pluck().all(), ["Valid"]); }
    finally { db.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("read-only dry run detects within-file ownership and duplicate conflicts without changing database bytes", () => {
  const f = fixture();
  try {
    const setup = new Database(f.filename);
    setup.exec("INSERT INTO customers(id,name) VALUES (-1,'Existing'); INSERT INTO accounts(customer_id,balance,max_overdraft_week) VALUES (-1,-731,2000);");
    setup.close();
    fs.writeFileSync(f.csv, "name,uid\nPlanned,ABCD\nPlanned,BEEF\nConflict,BEEF\n");
    const before = fs.readFileSync(f.filename);
    assert.equal(f.run(["--dry-run"]).status, 1);
    assert.deepEqual(fs.readFileSync(f.filename), before);
    fs.writeFileSync(f.csv, "name,uid\nPlanned,ABCD\nPlanned,BEEF\n");
    assert.equal(f.run(["--dry-run"]).status, 0);
    assert.equal(f.run(["--dry-run", "--no-skip-duplicates"]).status, 1);
    fs.writeFileSync(f.csv, "name,uid\nPlanned,BEEF\nExisting,BEEF\n");
    assert.equal(f.run(["--dry-run"]).status, 1);
    assert.deepEqual(fs.readFileSync(f.filename), before);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("standalone templates contain only headers without a database, and relative database paths are independent of cwd", () => {
  const f = fixture();
  try {
    fs.unlinkSync(f.filename);
    const nameAndUid = f.run(["--template", "--with-uid"], path.dirname(web), true);
    assert.equal(nameAndUid.status, 0, nameAndUid.stderr);
    assert.equal(fs.readFileSync(f.csv, "utf8"), "name,uid\n");
    const nameOnly = f.run(["--template"], web, true);
    assert.equal(nameOnly.status, 0, nameOnly.stderr);
    assert.equal(fs.readFileSync(f.csv, "utf8"), "name\n");
    assert.equal(fs.existsSync(f.filename), false);
    const missing = f.run(["--dry-run"]);
    assert.equal(missing.status, 1);
    assert.equal(fs.existsSync(f.filename), false);
    const db = new Database(f.filename);
    db.exec(fs.readFileSync(path.join(web, "../migrations/schema.sql"), "utf8"));
    db.exec(fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
    db.close();
    fs.writeFileSync(f.csv, "name\nRoot Cwd\n");
    const root = f.run([], path.dirname(web), true);
    assert.equal(root.status, 0, root.stderr);
    fs.writeFileSync(f.csv, "name\nPackage Cwd\n");
    const pkg = f.run([], web, true);
    assert.equal(pkg.status, 0, pkg.stderr);
    const final = new Database(f.filename, { readonly: true });
    try { assert.deepEqual(final.prepare("SELECT name FROM customers ORDER BY id").pluck().all(), ["Root Cwd", "Package Cwd"]); }
    finally { final.close(); }
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
