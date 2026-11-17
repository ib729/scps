import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { ensureFinanceSchema } from "./finance-schema";
import { saveFinanceSetup, saveFinanceEntry, saveFinanceObservation, getFinanceDraft, closeFinanceMonth, getFinanceReport } from "./finance";
import { buildFinanceWorkbook } from "./finance-xlsx";

async function loadWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  return workbook;
}

function findRow(sheet: ExcelJS.Worksheet, label: string) {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow(row => { if (row.getCell(1).value === label) found = row; });
  assert.ok(found, `Missing row ${label}`);
  return found;
}

test("workbook preserves saved evidence, numeric amounts and literal user text", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T00:00:00Z") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-xlsx-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO accounts(customer_id,balance) VALUES(1,4000); INSERT INTO transactions(id,customer_id,type,amount,payment_method,created_at) VALUES(1,1,'TOPUP',10000,'WeChat','2026-10-10 04:00:00'),(2,1,'TOPUP',123,'Voucher','2026-10-11 04:00:00'); INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,status,created_by_user_id,approved_transaction_id,expires_at,reviewed_at) VALUES(1,10000,10017,'approved','u',1,'2026-10-11 00:00:00','2026-10-10 04:00:00');");
    const actor = { id: "staff", name: "Finance Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const expense = { id: "e1aaacb8-8027-4000-80ed-51b7eff33ed4", expectedRevision: 0, kind: "expense" as const, date: "2026-10-12", channel: "WeChat" as const, amount: "35", description: "=SUM(1,2)", recipient: "@recipient", reference: "+reference", voided: false };
    saveFinanceEntry(db, expense, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, explanation: "Review the voucher", expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    const id = closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    const snapshot = getFinanceReport(db, id)!.snapshot;
    saveFinanceEntry(db, { ...expense, expectedRevision: 1, amount: "36", reason: "Correction" }, actor);
    const workbook = await loadWorkbook(await buildFinanceWorkbook(snapshot));
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ["Summary", "Balances", "Expenses", "Receipts", "Transfers", "Notes"]);
    assert.equal(findRow(workbook.getWorksheet("Summary")!, "Revision").getCell(2).value, 1);
    assert.equal(findRow(workbook.getWorksheet("Summary")!, "Expenses").getCell(2).value, 35);
    assert.equal(findRow(workbook.getWorksheet("Summary")!, "Explanation").getCell(2).value, "Review the voucher");
    const expenses = workbook.getWorksheet("Expenses")!;
    assert.equal(expenses.getRow(2).getCell(3).value, 35);
    assert.equal(expenses.getRow(2).getCell(4).value, "=SUM(1,2)");
    assert.equal(expenses.getRow(2).getCell(5).value, "@recipient");
    assert.equal(expenses.getRow(2).getCell(6).value, "+reference");
    assert.equal(expenses.getRow(2).getCell(4).type, ExcelJS.ValueType.String);
    assert.match(expenses.getRow(2).getCell(3).numFmt, /0\.00/);
    assert.equal(expenses.autoFilter, "A1:G2");
    const receipts = workbook.getWorksheet("Receipts")!;
    const wechat = findRow(receipts, "wechat_request");
    assert.equal(wechat.getCell(6).value, 100);
    assert.equal(wechat.getCell(7).value, 100.17);
    assert.ok(JSON.stringify(receipts.getSheetValues()).includes("Voucher"));
    assert.ok(JSON.stringify(workbook.getWorksheet("Notes")!.getSheetValues()).includes("Review the voucher"));
    const tooLong = structuredClone(snapshot);
    tooLong.draft.receipts[0].description = "x".repeat(32768);
    await assert.rejects(() => buildFinanceWorkbook(tooLong), /cell text limit/i);
    const tooMany = structuredClone(snapshot);
    tooMany.draft.receipts = Array(1_048_574).fill(tooMany.draft.receipts[0]);
    await assert.rejects(() => buildFinanceWorkbook(tooMany), /row limit.*Receipts/i);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("empty statements keep detail headers and zero totals", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-xlsx-"));
  const db = new Database(path.join(directory, "ledger.sqlite"));
  try {
    db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
    ensureFinanceSchema(db);
    const actor = { id: "staff", name: "Staff" };
    const now = new Date("2026-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    saveFinanceObservation(db, { month: "2026-10", balances: { WeChat: "0", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2026-10", now)!;
    const id = closeFinanceMonth(db, { month: "2026-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    const workbook = await loadWorkbook(await buildFinanceWorkbook(getFinanceReport(db, id)!.snapshot));
    for (const name of ["Expenses", "Receipts", "Transfers"]) {
      const sheet = workbook.getWorksheet(name)!;
      assert.ok(sheet.getRow(1).getCell(1).value);
      assert.equal(findRow(sheet, name === "Receipts" ? "Total recorded receipts" : "Total").getCell(name === "Receipts" ? 7 : 3).value, 0);
      if (name === "Receipts") assert.equal(findRow(sheet, "Total other income").getCell(7).value, 0);
    }
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
