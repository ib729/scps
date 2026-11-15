import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execute=promisify(execFile);

test("checkout borrows only new debt, preserves weekly consumption and rolls back failed writes",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"scps-checkout-"));
  process.env.DATABASE_PATH=path.join(dir,"ledger.db");
  const initial=new Database(process.env.DATABASE_PATH);
  initial.exec(fs.readFileSync("../migrations/schema.sql","utf8")+fs.readFileSync("migrations/better_auth_schema.sql","utf8"));initial.close();
  // Import after the disposable database is selected; db.ts resolves its path on load.
  const {getDb,closeDb}=await import("../db");
  const {getCurrentWeekStartUtc}=await import("./overdraft");
  const {checkoutStudent}=await import("./checkout");
  const db=getDb();
  function reset(balance=0){db.exec("DELETE FROM transactions; DELETE FROM overdraft_weeks; DELETE FROM accounts; DELETE FROM students; INSERT INTO students(id,name) VALUES(1,'Checkout');");db.prepare("INSERT INTO accounts VALUES(1,?,1000)").run(balance);}
  try{
    reset();
    for(let i=0;i<2;i++)assert.equal(checkoutStudent({student_id:1,amount:500,staff:"test"}).overdraftUsed,500);
    assert.equal(db.prepare("SELECT balance FROM accounts").pluck().get(),-1000);
    assert.deepEqual(db.prepare("SELECT overdraft_component FROM transactions").pluck().all(),[500,500]);
    assert.equal(db.prepare("SELECT used FROM overdraft_weeks").pluck().get(),1000);
    assert.throws(()=>checkoutStudent({student_id:1,amount:1,staff:"test"}),/Insufficient funds/);
    assert.equal(db.prepare("SELECT count(*) FROM transactions").pluck().get(),2);
    reset(200);assert.equal(checkoutStudent({student_id:1,amount:500,staff:"test"}).overdraftUsed,300);
    reset(-200);assert.equal(checkoutStudent({student_id:1,amount:500,staff:"test"}).overdraftUsed,500);
    db.exec("UPDATE accounts SET balance=100");
    assert.equal(checkoutStudent({student_id:1,amount:200,staff:"test"}).overdraftUsed,100);
    assert.equal(db.prepare("SELECT used FROM overdraft_weeks").pluck().get(),600);
    for(const amount of [0,-1,0.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>checkoutStudent({student_id:1,amount,staff:"test"}));
    reset();db.exec("DELETE FROM accounts");assert.throws(()=>checkoutStudent({student_id:1,amount:100,staff:"test"}));
    assert.equal(db.prepare("SELECT count(*) FROM transactions").pluck().get(),0);
    assert.equal(db.prepare("SELECT count(*) FROM overdraft_weeks").pluck().get(),0);
    reset();db.exec("CREATE TRIGGER fail BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(()=>checkoutStudent({student_id:1,amount:500,staff:"test"}),/injected/);
    assert.equal(db.prepare("SELECT balance FROM accounts").pluck().get(),0);
    assert.equal(db.prepare("SELECT count(*) FROM overdraft_weeks").pluck().get(),0);db.exec("DROP TRIGGER fail");
    for(const tz of ["UTC","America/Los_Angeles"]){process.env.TZ=tz;for(const [now,want] of [["2026-11-15T15:59:59Z","2026-11-08T16:00:00.000Z"],["2026-11-15T16:00:00Z","2026-11-15T16:00:00.000Z"],["2026-11-15T23:59:00Z","2026-11-15T16:00:00.000Z"]])assert.equal(getCurrentWeekStartUtc(new Date(now)),want);}
    reset();
    const script="import {checkoutStudent} from './lib/repositories/checkout.ts';import {closeDb} from './lib/db.ts';try{checkoutStudent({student_id:1,amount:600,staff:'race'});console.log('accepted')}catch{console.log('refused')}finally{closeDb()}";
    const results=await Promise.all([0,1].map(()=>execute(process.execPath,["--import","tsx","--input-type=module","-e",script],{env:process.env})));
    assert.deepEqual(results.map(r=>r.stdout.trim()).sort(),["accepted","refused"]);
    assert.equal(db.prepare("SELECT balance FROM accounts").pluck().get(),-600);
  }finally{closeDb();fs.rmSync(dir,{recursive:true,force:true});}
});
