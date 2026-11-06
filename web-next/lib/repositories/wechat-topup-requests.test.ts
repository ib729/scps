import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { notifyWechatTopupRequestClaimed } from "../notifications";

test("payment approval credits only the base amount once and rolls back on failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-wcp-test-"));
  process.env.DATABASE_PATH = path.join(directory, "stuco.db");
  const setup = new Database(process.env.DATABASE_PATH);
  setup.exec(fs.readFileSync(path.resolve("../migrations/schema.sql"), "utf8"));
  setup.exec(fs.readFileSync(path.resolve("migrations/better_auth_schema.sql"), "utf8"));
  setup.prepare("INSERT INTO students(id, name) VALUES (1, 'Payment test')").run();
  setup.prepare("INSERT INTO accounts(student_id, balance) VALUES (1, 500)").run();
  setup.close();

  // The DB module resolves DATABASE_PATH on import, after fixture initialization.
  const { getDb, closeDb } = await import("../db");
  const {
    createWechatTopupRequest,
    markWechatTopupRequestClaimed,
    approveWechatTopupRequest,
    rejectWechatTopupRequest,
    listWechatTopupRequests,
  } = await import("./wechat-topup-requests");
  const create = () => createWechatTopupRequest({
    studentId: 1,
    requestedAmount: 1000,
    createdByUserId: "staff-test",
    createdByName: "Staff test",
  });
  const review = (requestId: number) => ({
    requestId,
    reviewedByUserId: "reviewer-test",
    reviewedByName: "Reviewer test",
  });

  try {
    const db = getDb();
    const first = create();
    const second = create();
    assert.equal(first.payable_amount, 1001);
    assert.equal(second.payable_amount, 1002);
    assert.throws(() => approveWechatTopupRequest(review(first.id)), /marked as sent/);
    markWechatTopupRequestClaimed(first.id);
    approveWechatTopupRequest(review(first.id));
    assert.throws(() => approveWechatTopupRequest(review(first.id)), /no longer/);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE student_id = 1").pluck().get(), 1500);
    assert.equal(db.prepare("SELECT COUNT(*) FROM transactions").pluck().get(), 1);

    markWechatTopupRequestClaimed(second.id);
    db.exec("CREATE TRIGGER fail_payment BEFORE UPDATE ON accounts BEGIN SELECT RAISE(ABORT, 'payment failure'); END");
    assert.throws(() => approveWechatTopupRequest(review(second.id)), /payment failure/);
    db.exec("DROP TRIGGER fail_payment");
    assert.equal(db.prepare("SELECT COUNT(*) FROM transactions").pluck().get(), 1);
    assert.equal(db.prepare("SELECT status FROM wechat_topup_requests WHERE id = ?").pluck().get(second.id), "pending");
    rejectWechatTopupRequest(review(second.id));
    assert.throws(() => approveWechatTopupRequest(review(second.id)), /no longer/);

    const expired = create();
    db.prepare("UPDATE wechat_topup_requests SET expires_at = datetime('now', '-1 second') WHERE id = ?").run(expired.id);
    listWechatTopupRequests();
    assert.throws(() => markWechatTopupRequestClaimed(expired.id), /no longer/);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE student_id = 1").pluck().get(), 1500);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.WCP_TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.WCP_TELEGRAM_CHAT_ID;
    try {
      await assert.rejects(notifyWechatTopupRequestClaimed(first), /not configured/);
    } finally {
      if (token !== undefined) process.env.TELEGRAM_BOT_TOKEN = token;
      if (chat !== undefined) process.env.WCP_TELEGRAM_CHAT_ID = chat;
    }
  } finally {
    closeDb();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
