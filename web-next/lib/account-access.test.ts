import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { test } from "node:test";
import { ensureUserSchema } from "./user-schema";

function fixture(role = "role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','staff')),") {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
  db.exec(fs.readFileSync("migrations/better_auth_schema.sql", "utf8").replace(/role TEXT[^\n]+/, role));
  db.exec("INSERT INTO user(id,name,email) VALUES ('operator','Operator','operator@example.test'); INSERT INTO students(id,name) VALUES(1,'Existing student'); INSERT INTO accounts(student_id,balance) VALUES(1,531); INSERT INTO transactions(student_id,type,amount) VALUES(1,'TOPUP',531); INSERT INTO session(id,userId,token,expiresAt) VALUES('session','operator','token',9999999999); INSERT INTO account(id,userId,accountId,providerId,password) VALUES('credential','operator','operator','credential','hash'); CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, preference TEXT); INSERT INTO user_preferences VALUES('operator','kept'); CREATE INDEX user_name ON user(name); CREATE TRIGGER user_updated AFTER UPDATE OF name ON user BEGIN UPDATE user SET updatedAt=123 WHERE id=NEW.id; END;");
  return db;
}

test("role migration preserves identities, credentials, links and cents on repeated initialization", () => {
  const db = fixture();
  try {
    db.exec("UPDATE user SET role='admin'; INSERT INTO user_student_links VALUES('operator',1)");
    db.exec("INSERT INTO user(id,name,email,role) VALUES('existing-staff','Existing staff','staff@example.test','staff')");
    const snapshot = () => ["user", "session", "account", "user_preferences", "user_student_links", "students", "accounts", "transactions"].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const once = snapshot();
    ensureUserSchema(db);
    assert.deepEqual(snapshot(), once);
    ensureUserSchema(db);
    assert.deepEqual(snapshot(), once);
    assert.equal(db.prepare("SELECT role FROM user").pluck().get(), "admin");
    assert.equal(db.prepare("SELECT role FROM user WHERE id='existing-staff'").pluck().get(), "staff");
    assert.equal(db.prepare("SELECT balance FROM accounts").pluck().get(), 531);
    assert.equal(db.prepare("SELECT password FROM account").pluck().get(), "hash");
    assert.equal(db.prepare("SELECT token FROM session").pluck().get(), "token");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    for (const table of ["session", "account", "user_preferences", "user_student_links"]) assert.ok((db.pragma(`foreign_key_list(${table})`) as {table:string}[]).some(row => row.table === "user"));
    assert.equal(db.prepare("SELECT count(*) FROM sqlite_schema WHERE name IN ('user_name','user_updated')").pluck().get(), 2);
    db.exec("INSERT INTO user(id,name,email) VALUES('student','Student','student@example.test')");
    assert.equal(db.prepare("SELECT role FROM user WHERE id='student'").pluck().get(), "student");
  } finally { db.close(); }
});

test("legacy operators remain staff and students are never auto-promoted", () => {
  const db = fixture("");
  try {
    ensureUserSchema(db);
    assert.equal(db.prepare("SELECT role FROM user").pluck().get(), "staff");
    db.exec("UPDATE user SET role='student'");
    ensureUserSchema(db);
    assert.equal(db.prepare("SELECT role FROM user").pluck().get(), "student");
  } finally { db.close(); }
});

test("unsupported columns and orphan references refuse migration without partial mutation", () => {
  for (const unsupported of [true, false]) {
    const db = fixture();
    try {
      if (unsupported) db.exec("ALTER TABLE user ADD COLUMN unexpected TEXT");
      else { db.pragma("foreign_keys=OFF"); db.exec("INSERT INTO session(id,userId,token,expiresAt) VALUES('orphan','missing','orphan',1)"); db.pragma("foreign_keys=ON"); }
      const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE name='user'").pluck().get();
      assert.throws(() => ensureUserSchema(db), unsupported ? /Unsupported user schema.*unexpected/ : /foreign.key/i);
      assert.equal(db.prepare("SELECT sql FROM sqlite_schema WHERE name='user'").pluck().get(), sql);
      assert.equal(db.pragma("foreign_keys", {simple:true}), 1);
    } finally { db.close(); }
  }
});

test("administrator linking and grants preserve ownership and financial history", async () => {
  const os = await import("node:os");
  const path = await import("node:path");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-access-"));
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  const setup = fixture();
  setup.exec("UPDATE user SET role='admin'");
  fs.writeFileSync(process.env.DATABASE_PATH, setup.serialize());
  setup.close();
  // DB-dependent imports must follow fixture creation: db.ts resolves DATABASE_PATH at import time.
  const { getDb, closeDb } = await import("./db");
  const access = await import("./repositories/account-access");
  try {
    const db = getDb();
    db.exec("INSERT INTO user(id,name,email,role) VALUES('a','A','a@test','student'),('b','B','b@test','student'),('staff','Staff','staff@test','staff'); INSERT INTO students(id,name,archived) VALUES(2,'Archived',1),(3,'No account',0); INSERT INTO accounts(student_id,balance) VALUES(2,700)");
    assert.throws(() => access.approveStudentRegistration("staff","a",1), /Forbidden/);
    assert.throws(() => access.approveStudentRegistration("a","a",1), /Forbidden/);
    access.approveStudentRegistration("operator","a",1);
    access.approveStudentRegistration("operator","a",1);
    assert.equal(access.getLinkedStudentId("a"), 1);
    assert.throws(() => access.approveStudentRegistration("operator","b",1), /already linked/);
    assert.throws(() => access.approveStudentRegistration("operator","a",2), /already linked/);
    for (const id of [2,3,999]) assert.throws(() => access.approveStudentRegistration("operator","b",id), /unavailable/);
    assert.throws(() => access.setUserRole("staff","staff","admin"), /Forbidden/);
    assert.throws(() => access.setUserRole("operator","operator","staff"), /last administrator/);
    access.setUserRole("operator","a","admin");
    access.setUserRole("operator","operator","staff");
    assert.throws(() => access.setUserRole("operator","b","admin"), /Forbidden/);
    access.setUserRole("a","operator","admin");
    access.setUserRole("operator","a","student");
    assert.equal(access.getLinkedStudentId("a"),1);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE student_id=1").pluck().get(),531);
    assert.deepEqual(db.prepare("SELECT type,amount FROM transactions").all(), [{type:"TOPUP",amount:531}]);
    const user = access.listUserAccess().find(user => user.id === "a")!;
    assert.equal(user.studentId,1);
    assert.equal(user.studentName,"Existing student");
    assert.deepEqual(Object.keys(user).sort(),["createdAt","email","id","name","role","studentId","studentName"].sort());
    db.exec("UPDATE students SET archived=0 WHERE id=2; INSERT INTO transactions(student_id,type,amount,description,staff,card_uid) VALUES(2,'ADJUST',777,'other private note','other operator','other-card'); UPDATE transactions SET description='private staff note',staff='private operator',card_uid='private-card' WHERE student_id=1; INSERT INTO wechat_topup_requests(id,student_id,requested_amount,payable_amount,created_by_user_id,internal_note,expires_at) VALUES(1,1,3000,3001,'private creator','private internal',datetime('now','+15 minutes')),(2,2,3000,3002,'other creator','other internal',datetime('now','+15 minutes'))");
    const { getStudentPortalData } = await import("./repositories/student-portal");
    const portal = getStudentPortalData(1);
    assert.deepEqual(portal.student,{id:1,name:"Existing student",balance:531});
    assert.deepEqual(portal.transactions.map(transaction => ({id:transaction.id,type:transaction.type,amount:transaction.amount})),[{id:1,type:"TOPUP",amount:531}]);
    assert.deepEqual(portal.pendingRequests.map(request => ({id:request.id,payable:request.payable_amount})),[{id:1,payable:3001}]);
    assert.deepEqual(Object.keys(portal.transactions[0]).sort(),["id","type","amount","payment_method","created_at"].sort());
    assert.deepEqual(Object.keys(portal.pendingRequests[0]).sort(),["id","requested_amount","payable_amount","status","created_at","expires_at","claimed_at","reviewed_at","review_note","approved_transaction_id"].sort());
    assert.equal(JSON.stringify(portal).includes("private"),false);
    db.exec("UPDATE students SET archived=1 WHERE id=1");
    assert.equal(access.getLinkedStudentId("a"),undefined);
  } finally { closeDb(); fs.rmSync(directory,{recursive:true,force:true}); }
});

test("unknown generated columns and missing core columns are refused before data loss", () => {
  for (const alteration of ["ALTER TABLE user ADD COLUMN generated_name TEXT GENERATED ALWAYS AS (name) VIRTUAL", "ALTER TABLE user DROP COLUMN image"]) {
    const db = fixture();
    try {
      db.exec(alteration);
      const before = db.prepare("SELECT * FROM user").all();
      assert.throws(() => ensureUserSchema(db), /Unsupported user schema/);
      assert.deepEqual(db.prepare("SELECT * FROM user").all(),before);
    } finally { db.close(); }
  }
});

test("invalid legacy roles become unprivileged students, never operators", () => {
  const db = fixture("role TEXT DEFAULT 'staff',");
  try {
    db.exec("UPDATE user SET role='unexpected'");
    ensureUserSchema(db);
    assert.equal(db.prepare("SELECT role FROM user WHERE id='operator'").pluck().get(),"student");
    assert.equal(db.prepare("SELECT count(*) FROM user WHERE role IN ('admin','staff')").pluck().get(),0);
  } finally { db.close(); }
});
