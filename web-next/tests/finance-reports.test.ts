import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { ensureFinanceSchema } from "../lib/finance-schema";
import { saveFinanceSetup, saveFinanceEntry, saveFinanceObservation, getFinanceDraft, closeFinanceMonth } from "../lib/finance";
import { startTestServer } from "./helpers/server";

test("saved finance exports enforce staff access and preserve old revisions", async () => {
  const server = await startTestServer({ webpack: true });
  try {
    const db = server.database;
    ensureFinanceSchema(db);
    const actor = db.prepare<[], { id: string; name: string }>("SELECT id,name FROM user WHERE email='staff@example.test'").get()!;
    const now = new Date("2020-11-02T00:00:00Z");
    saveFinanceSetup(db, { startMonth: "2020-10", balances: { WeChat: "100", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const entry = { id: "ec247af4-08a1-4e76-9a56-83e966bf695a", expectedRevision: 0, kind: "expense" as const, date: "2020-10-10", channel: "WeChat" as const, amount: "35", description: "Snacks", voided: false };
    saveFinanceEntry(db, entry, actor);
    saveFinanceObservation(db, { month: "2020-10", balances: { WeChat: "65", Alipay: "0", Cash: "0" }, expectedRevision: 0 }, actor);
    const draft = getFinanceDraft(db, "2020-10", now)!;
    const id = closeFinanceMonth(db, { month: "2020-10", expectedRevision: 0, expectedHash: draft.sourceHash }, actor, now);
    saveFinanceEntry(db, { ...entry, expectedRevision: 1, amount: "36", reason: "Correct receipt" }, actor);
    async function login(email: string) {
      const response = await fetch(`${server.baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: server.baseURL }, body: JSON.stringify({ email, password: "scps-test-password-123" }) });
      assert.equal(response.status, 200);
      return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
    }
    const url = `${server.baseURL}/api/finance/reports/${id}/export`;
    const request = (cookie?: string, target = url) => fetch(target, { headers: cookie ? { Cookie: cookie } : {} });
    assert.equal((await request()).status, 401);
    const customer = await login("customer@example.test");
    assert.equal((await request(customer)).status, 403);
    const staff = await login("staff@example.test");
    const admin = await login("admin@example.test");
    for (const cookie of [staff, admin]) {
      const response = await request(cookie);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      assert.equal(response.headers.get("content-disposition"), 'attachment; filename="scps-finance-2020-10-r1.xlsx"');
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
      const summary = workbook.getWorksheet("Summary")!;
      const values = new Map<string, unknown>();
      summary.eachRow(row => values.set(String(row.getCell(1).value), row.getCell(2).value));
      assert.equal(values.get("Expenses"), 35);
      assert.equal(values.get("Expected funds"), 65);
      assert.equal(values.get("Revision"), 1);
    }
    const instantUrl = `${server.baseURL}/api/finance/instant/export?month=2020-10`;
    assert.equal((await request(undefined, instantUrl)).status, 401);
    assert.equal((await request(customer, instantUrl)).status, 403);
    for (const cookie of [staff, admin]) {
      const response = await request(cookie, instantUrl);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("content-disposition"), 'attachment; filename="scps-finance-2020-10-provisional.xlsx"');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
      const summary = JSON.stringify(workbook.getWorksheet("Summary")!.getSheetValues());
      assert.match(summary, /Provisional report, not a closed statement/);
      assert.doesNotMatch(summary, /"Revision"/);
    }
    assert.equal((await request(staff, `${server.baseURL}/api/finance/instant/export?month=9999-12`)).status, 400);
    const instantPrint = await fetch(`${server.baseURL}/finance/instant?month=2020-10`, { headers: { Cookie: staff } });
    assert.equal(instantPrint.status, 200);
    assert.match(await instantPrint.text(), /Provisional finance report/);
    assert.equal(db.prepare("SELECT count(*) FROM finance_reports").pluck().get(), 1);
    assert.equal((await request(staff, `${server.baseURL}/api/finance/reports/1x/export`)).status, 400);
    assert.equal((await request(staff, `${server.baseURL}/api/finance/reports/999999/export`)).status, 404);
    const print = await fetch(`${server.baseURL}/finance/reports/${id}`, { headers: { Cookie: staff } });
    assert.equal(print.status, 200);
    assert.match(await print.text(), /Monthly statement/);
    const deniedPrint = await fetch(`${server.baseURL}/finance/reports/${id}`, { headers: { Cookie: customer }, redirect: "manual" });
    assert.equal(deniedPrint.status, 307);
    assert.match(deniedPrint.headers.get("location")!, /^\/customer/);
    db.exec("DELETE FROM session WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
    assert.equal((await request(staff)).status, 401);
    const fresh = await login("staff@example.test");
    db.exec("UPDATE session SET expiresAt=0 WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
    assert.equal((await request(fresh)).status, 401);
  } finally {
    await server.close();
  }
});
