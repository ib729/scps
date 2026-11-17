import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureFinanceSchema } from "./finance-schema";
import { getFinanceMonthBounds, parseFinanceAmount, saveFinanceSetup, saveFinanceEntry, saveFinanceObservation, getFinanceDraft, closeFinanceMonth, getFinanceReport, getFinancePageData } from "./finance";

test("amounts are exact cents and reject invalid or unsafe values", () => {
  assert.equal(parseFinanceAmount(" 100.17 ", false), 10017);
  assert.equal(parseFinanceAmount("0", true), 0);
  for (const value of ["0", "1.001", "1e2", "-1", "90071992547409.92"]) {
    assert.throws(() => parseFinanceAmount(value, false));
  }
});

test("month boundaries use China time independently of host timezone", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      assert.deepEqual(getFinanceMonthBounds("2026-10"), {
        startUtc: "2026-09-30T16:00:00.000Z",
        endUtc: "2026-10-31T16:00:00.000Z",
      });
    }
    for (const month of ["1999-12", "2026-00", "2026-13", "2026-1"]) {
      assert.throws(() => getFinanceMonthBounds(month));
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("finance schema is additive and idempotent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    db.exec("INSERT INTO customers(id, name) VALUES (1, 'Existing')");
    ensureFinanceSchema(db);
    db.prepare("INSERT INTO finance_setup_versions VALUES (1, '2026-10', 0, 10000, 0, NULL, 'u', 'Staff', '2026-11-01T00:00:00.000Z')").run();
    ensureFinanceSchema(db);
    assert.equal(db.prepare("SELECT count(*) FROM finance_setup_versions").pluck().get(), 1);
    assert.equal(db.prepare("SELECT name FROM customers WHERE id=1").pluck().get(), "Existing");
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("manual entry revisions are immutable and stale writes are refused", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T00:00:00Z") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "20" }, expectedRevision: 0 }, actor);
    const entry = { id: "a6e9836b-b37b-4cd5-9ebe-503da8a9589f", expectedRevision: 0, kind: "transfer" as const, date: "2026-10-02", channel: "WeChat" as const, toChannel: "Cash" as const, amount: "20", description: "Transfer", voided: false };
    saveFinanceEntry(db, entry, actor);
    assert.throws(() => saveFinanceEntry(db, entry, actor), /reload/i);
    assert.equal(db.prepare("SELECT amount FROM finance_entry_versions WHERE entry_id=? AND revision=1").pluck().get(entry.id), 2000);
    saveFinanceEntry(db, { ...entry, expectedRevision: 1, voided: true, reason: "Duplicate" }, actor);
    assert.deepEqual(db.prepare("SELECT revision, voided FROM finance_entry_versions WHERE entry_id=? ORDER BY revision").all(entry.id), [
      { revision: 1, voided: 0 }, { revision: 2, voided: 1 },
    ]);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("month-end observations distinguish missing balances from recorded zero", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const observation = { month: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 };
    assert.equal(db.prepare("SELECT count(*) FROM finance_balance_versions").pluck().get(), 0);
    saveFinanceObservation(db, observation, actor);
    assert.throws(() => saveFinanceObservation(db, observation, actor), /reload/i);
    assert.deepEqual(db.prepare("SELECT cash,wechat,alipay FROM finance_balance_versions").get(), { cash: 0, wechat: 0, alipay: 0 });
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("draft counts approved payable once and separates sales from receipts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name,archived) VALUES(1,'Fixture',1); INSERT INTO accounts(customer_id,balance) VALUES(1,4000);");
    db.exec("INSERT INTO transactions(id,customer_id,type,amount,payment_method,created_at) VALUES(1,1,'TOPUP',10000,'WeChat','2026-10-10 04:00:00'),(2,1,'DEBIT',-6000,'Balance','2026-10-11 04:00:00');");
    db.exec("INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,status,created_by_user_id,approved_transaction_id,expires_at,reviewed_at) VALUES(1,10000,10017,'approved','u',1,'2026-10-11 00:00:00','2026-10-10 04:00:00');");
    const actor = { id: "staff", name: "Staff" };
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "20" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", new Date("2026-11-02T00:00:00Z"))!;
    assert.equal(draft.summary.receiptsCents.WeChat, 10017);
    assert.equal(draft.summary.salesCents, 6000);
    assert.equal(draft.summary.totalExpectedCents, 22017);
    assert.equal(draft.receipts[0].creditedCents, 10000);
    assert.equal(draft.creditObservation.creditOwedCents, 4000);
    assert.equal(draft.observation, null);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("saved reports preserve original data and detect later corrections", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    assert.equal(draft.canClose, true);
    const id = closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    assert.throws(() => closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now), /reload/i);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Later'); INSERT INTO transactions(id,customer_id,type,amount,payment_method,created_at) VALUES(1,1,'TOPUP',1000,'WeChat','2026-11-10 00:00:00'); INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,status,created_by_user_id,approved_transaction_id,expires_at,reviewed_at) VALUES(1,1000,1001,'approved','u',1,'2026-11-11 00:00:00','2026-11-10 00:00:00');");
    db.exec("INSERT INTO accounts(customer_id,balance) VALUES(1,54321)");
    assert.equal(getFinanceReport(db, id)!.stale, false);
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "101", Alipay: "0", Cash: "0" }, expectedRevision: 1, reason: "Correct opening" }, actor);
    const report = getFinanceReport(db, id)!;
    assert.equal(report.stale, true);
    assert.equal(report.snapshot.draft.summary.totalExpectedCents, 10000);
    assert.equal(getFinanceDraft(db, "2026-10", now)!.summary.totalExpectedCents, 10100);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("transfers, unknown receipts, CLI adjustments, and per-channel differences require reconciliation", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T00:00:00Z") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO accounts(customer_id,balance) VALUES(1,-500); INSERT INTO transactions(customer_id,type,amount,payment_method,staff,created_at) VALUES(1,'TOPUP',200,'Voucher',NULL,'2026-10-01 00:00:00'),(1,'TOPUP',1000,'Cash','CLI-Admin','2026-10-02 00:00:00'),(1,'DEBIT',-300,'Balance','CLI-Admin','2026-10-03 00:00:00');");
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    saveFinanceEntry(db, { id: "21d6e81c-76db-4ec0-a40d-c43bf5e23ca1", expectedRevision: 0, kind: "transfer", date: "2026-10-04", channel: "WeChat", toChannel: "Cash", amount: "20", description: "Transfer", voided: false }, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "81", Alipay: "0", Cash: "19" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    assert.equal(draft.summary.expectedClosingCents.WeChat, 8000);
    assert.equal(draft.summary.expectedClosingCents.Cash, 2000);
    assert.equal(draft.summary.expectedClosingCents.Unassigned, 200);
    assert.equal(draft.summary.walletAdjustmentsCents, 700);
    assert.equal(draft.summary.salesCents, 0);
    assert.equal(draft.creditObservation.debtCents, 500);
    assert.equal(draft.canClose, false);
    assert.ok(draft.warnings.some(warning => warning.includes("Voucher")));
    assert.ok(draft.warnings.some(warning => warning.includes("CLI-Admin")));
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "81", Alipay: "0", Cash: "19" }, explanation: "Review needed", expectedRevision: 1 }, actor);
    const ready = getFinanceDraft(db, "2026-10", now)!;
    assert.equal(ready.canClose, true);
    db.exec("CREATE TRIGGER reject_finance_report BEFORE INSERT ON finance_reports BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(() => closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: ready.sourceHash }, actor, now), /injected/);
    assert.equal(db.prepare("SELECT count(*) FROM finance_reports").pluck().get(), 0);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("orphaned approved receipts remain visible and duplicate links fail", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO transactions(id,customer_id,type,amount,payment_method,created_at) VALUES(1,1,'TOPUP',1000,'WeChat','2026-10-10 00:00:00'); INSERT INTO wechat_topup_requests(id,customer_id,requested_amount,payable_amount,status,created_by_user_id,approved_transaction_id,expires_at,reviewed_at) VALUES(1,1,1000,1010,'approved','u',1,'2026-10-11 00:00:00','2026-10-10 00:00:00');");
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "10.10", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    const id = closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    db.exec("INSERT INTO wechat_topup_requests(id,customer_id,requested_amount,payable_amount,status,created_by_user_id,approved_transaction_id,expires_at,reviewed_at) VALUES(2,1,1000,1010,'approved','u',1,'2026-10-11 00:00:00','2026-10-10 00:00:00');");
    assert.throws(() => getFinanceDraft(db, "2026-10", now), /requests 1 and 2/);
    assert.equal(getFinanceReport(db, id)!.stale, true);
    const page = getFinancePageData(db, "2026-10", now);
    assert.equal(page.draft, null);
    assert.match(page.error!, /requests 1 and 2/);
    assert.equal(page.revisions[0].snapshot.draft.summary.receiptsCents.WeChat, 1010);
    db.exec("DELETE FROM wechat_topup_requests WHERE id=2; INSERT INTO customers(id,name) VALUES(2,'Other'); UPDATE wechat_topup_requests SET customer_id=2 WHERE id=1;");
    assert.throws(() => getFinanceDraft(db, "2026-10", now), /conflicting.*transaction 1/i);
    db.exec("UPDATE wechat_topup_requests SET customer_id=1 WHERE id=1; DELETE FROM transactions WHERE id=1");
    const orphan = getFinanceDraft(db, "2026-10", now)!;
    assert.equal(orphan.summary.receiptsCents.WeChat, 1010);
    assert.equal(orphan.canClose, false);
    assert.ok(orphan.warnings.some(warning => warning.includes("request 1")));
    assert.equal(getFinanceReport(db, id)!.snapshot.draft.summary.receiptsCents.WeChat, 1010);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("validation rejects forged actors, impossible dates, unsafe sources, and stale hashes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    const setup = { startMonth: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 };
    assert.throws(() => saveFinanceSetup(db, { ...setup, actor } as typeof setup, actor));
    saveFinanceSetup(db, setup, actor);
    assert.throws(() => saveFinanceSetup(db, { ...setup, startMonth: "2026-11", expectedRevision: 1, reason: "Change" }, actor));
    const entry = { id: "87edc8c2-fdf7-44ff-ad98-e52abfb0e2d2", expectedRevision: 0, kind: "expense" as const, date: "2026-10-32", channel: "WeChat" as const, amount: "1", description: "Test", voided: false };
    assert.throws(() => saveFinanceEntry(db, entry, actor));
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const now = new Date("2026-11-02T00:00:00Z");
    const draft = getFinanceDraft(db, "2026-10", now)!;
    assert.throws(() => closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: "stale" }, actor, now), /reload/i);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO transactions(id,customer_id,type,amount,payment_method,created_at) VALUES(1,1,'TOPUP',-1,'Cash','2026-10-01 00:00:00');");
    assert.throws(() => getFinanceDraft(db, "2026-10", now), /transaction 1/i);
    assert.equal(db.prepare("SELECT count(*) FROM finance_reports").pluck().get(), 0);
    assert.equal(draft.summary.totalExpectedCents, 0);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("moving and voiding entries preserves history without resurrecting earlier versions", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T00:00:00Z") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-12-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const entry = { id: "87197836-88c3-4faa-998e-ff41421ed845", expectedRevision: 0, kind: "expense" as const, date: "2026-10-10", channel: "WeChat" as const, amount: "10", description: "Purchase", voided: false };
    saveFinanceEntry(db, entry, actor);
    saveFinanceObservation(db, { month: "2026-11", balances: { WeChat: "90", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-11", now)!;
    const id = closeFinanceMonth(db, { month: "2026-11", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    saveFinanceEntry(db, { ...entry, expectedRevision: 1, date: "2026-11-10", reason: "Correct date" }, actor);
    assert.equal(getFinanceDraft(db, "2026-10", now)!.summary.expectedClosingCents.WeChat, 10000);
    assert.equal(getFinancePageData(db, "2026-10", now).entries[0].date, "2026-11-10");
    assert.equal(getFinancePageData(db, "2026-10", now).entryHistory.length, 2);
    assert.equal(getFinanceReport(db, id)!.stale, true);
    const updated = getFinanceDraft(db, "2026-11", now)!;
    const revisedId = closeFinanceMonth(db, { month: "2026-11", expectedRevision: 1, expectedHash: updated.sourceHash, reason: "Correct date" }, actor, now);
    assert.deepEqual(getFinanceReport(db, revisedId)!.snapshot.evidence.entries.map(item => item.revision), [1, 2]);
    saveFinanceEntry(db, { ...entry, expectedRevision: 2, date: "2026-11-10", reason: "Duplicate", voided: true }, actor);
    assert.equal(getFinanceDraft(db, "2026-11", now)!.summary.expectedClosingCents.WeChat, 10000);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("unsafe intermediate totals are rejected even when later movements cancel them", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T00:00:00Z") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO transactions(customer_id,type,amount,payment_method,created_at) VALUES(1,'TOPUP',1,'WeChat','2026-10-10 00:00:00');");
    const actor = { id: "staff", name: "Staff" };
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "90071992547409.91", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    saveFinanceEntry(db, { id: "4ed6c2d2-a159-4869-a74b-d8863dffac89", expectedRevision: 0, kind: "expense", date: "2026-10-11", channel: "WeChat", amount: "0.01", description: "Expense", voided: false }, actor);
    assert.throws(() => getFinanceDraft(db, "2026-10", new Date("2026-11-02T00:00:00Z")), /unsafe amount/i);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("channel differences cannot cancel and month boundaries exclude the following month", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO transactions(customer_id,type,amount,payment_method,created_at) VALUES(1,'TOPUP',500,'Cash','2026-10-31 16:00:00');");
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "10", Alipay: "0", Cash: "10" }, expectedRevision: 0 }, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "11", Alipay: "0", Cash: "9" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    assert.equal(draft.summary.receiptsCents.Cash, 0);
    assert.equal(draft.summary.totalVarianceCents, 0);
    assert.equal(draft.summary.varianceCents!.WeChat, 100);
    assert.equal(draft.summary.varianceCents!.Cash, -100);
    assert.equal(draft.canClose, false);
    assert.equal(getFinanceDraft(db, "2026-11", now)!.summary.receiptsCents.Cash, 500);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
