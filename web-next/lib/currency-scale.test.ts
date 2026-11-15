import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const require = createRequire(import.meta.url);
const execute = promisify(execFile);
function fixture(marker?: string) {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
  db.exec(fs.readFileSync("migrations/better_auth_schema.sql", "utf8"));
  db.exec("DELETE FROM app_meta; INSERT INTO students(id,name) VALUES(1,'Legacy'); INSERT INTO accounts VALUES(1,55,200); INSERT INTO transactions(student_id,type,amount,overdraft_component) VALUES(1,'DEBIT',-20,5); INSERT INTO overdraft_weeks VALUES(1,'legacy',7)");
  if (marker) db.prepare("INSERT INTO app_meta VALUES('currency_scale',?)").run(marker);
  return db;
}
const state = (db: Database.Database) => [db.prepare("SELECT balance,max_overdraft_week FROM accounts").get(), db.prepare("SELECT amount,overdraft_component FROM transactions").get(), db.prepare("SELECT used FROM overdraft_weeks").get(), db.prepare("SELECT * FROM app_meta").all()];
test("legacy currency converts exactly once and existing cents stay unchanged", () => {
  const { ensureCurrencyScale } = require("./currency-scale.cjs");
  for (const marker of [undefined, "10", "100"]) {
    const db = fixture(marker);
    try {
      const before = state(db);
      ensureCurrencyScale(db);
      if (marker === "100") assert.deepEqual(state(db), before);
      else assert.deepEqual(state(db), [{balance:550,max_overdraft_week:2000},{amount:-200,overdraft_component:50},{used:70},[{key:"currency_scale",value:"100"}]]);
      const once = state(db);
      ensureCurrencyScale(db);
      assert.deepEqual(state(db), once);
    } finally { db.close(); }
  }
  const empty = fixture();
  try { empty.exec("DELETE FROM transactions; DELETE FROM overdraft_weeks; DELETE FROM accounts"); ensureCurrencyScale(empty); assert.equal(empty.prepare("SELECT value FROM app_meta").pluck().get(), "100"); } finally { empty.close(); }
});
test("conversion errors roll back values and marker together", () => {
  const { ensureCurrencyScale } = require("./currency-scale.cjs");
  for (const failure of ["unknown", "overflow", "update", "marker", "fraction"]) {
    const db = fixture(failure === "unknown" ? "bogus" : "10");
    try {
      if (failure === "overflow") db.exec("UPDATE accounts SET balance=9007199254740991");
      if (failure === "fraction") db.exec("UPDATE accounts SET balance=0.123");
      if (failure === "update") db.exec("CREATE TRIGGER fail BEFORE UPDATE ON transactions BEGIN SELECT RAISE(ABORT,'injected'); END");
      if (failure === "marker") db.exec("CREATE TRIGGER fail BEFORE INSERT ON app_meta BEGIN SELECT RAISE(ABORT,'injected'); END");
      const before = state(db);
      assert.throws(() => ensureCurrencyScale(db));
      assert.deepEqual(state(db), before);
    } finally { db.close(); }
  }
});
test("competing startup processes acquire the scale lock before reading the marker", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scps-scale-"));
  const filename = path.join(dir, "legacy.db");
  const db = fixture("10");
  fs.writeFileSync(filename, db.serialize()); db.close();
  try {
    const script = "import {getDb,closeDb} from './lib/db.ts';getDb();closeDb()";
    await Promise.all([0,1].map(() => execute(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {env:{...process.env,DATABASE_PATH:filename}})));
    const result = new Database(filename);
    try { assert.equal(result.prepare("SELECT balance FROM accounts").pluck().get(),550); assert.equal(result.prepare("SELECT value FROM app_meta").pluck().get(),"100"); } finally { result.close(); }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
