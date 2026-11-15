import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { notifyWechatTopupRequestClaimed } from "../notifications";

test("payment approval credits only the base amount once and rolls back on failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-wcp-test-"));
  process.env.DATABASE_PATH = path.join(directory, "stuco.db");
  const setup = new Database(process.env.DATABASE_PATH);
  setup.exec(fs.readFileSync(path.resolve("../migrations/schema.sql"), "utf8"));
  setup.exec(fs.readFileSync(path.resolve("migrations/better_auth_schema.sql"), "utf8"));
  setup.prepare("INSERT INTO customers(id, name) VALUES (1, 'Payment test')").run();
  setup.prepare("INSERT INTO accounts(customer_id, balance) VALUES (1, 500)").run();
  setup.close();

  // The DB module resolves DATABASE_PATH on import, after fixture initialization.
  const { getDb, closeDb } = await import("../db");
  const {
    createWechatTopupRequest,
    markWechatTopupRequestClaimed,
    approveWechatTopupRequest,
    rejectWechatTopupRequest,
    listWechatTopupRequests,
    parseWechatTopupAmount,
  } = await import("./wechat-topup-requests");
  const create = () => createWechatTopupRequest({
    customerId: 1,
    requestedAmount: 3000,
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
    assert.equal(first.payable_amount, 3001);
    assert.equal(second.payable_amount, 3002);
    assert.throws(() => approveWechatTopupRequest(review(first.id)), /marked as sent/);
    assert.equal(markWechatTopupRequestClaimed(first.id).newlyClaimed, true);
    assert.equal(markWechatTopupRequestClaimed(first.id).newlyClaimed, false);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE customer_id = 1").pluck().get(), 500);
    approveWechatTopupRequest(review(first.id));
    assert.throws(() => approveWechatTopupRequest(review(first.id)), /no longer/);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE customer_id = 1").pluck().get(), 3500);
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
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE customer_id = 1").pluck().get(), 3500);

    for (const [input, expected] of [["30",3000],["30.01",3001],[" 0.01 ",1]] as const) assert.equal(parseWechatTopupAmount(input), expected);
    for (const input of ["30.001","Infinity","1junk","0","-1","1e2","90071992547409.91","99999999999999999999999999"]) assert.throws(() => parseWechatTopupAmount(input), /positive amount/);
    const missing = create();
    markWechatTopupRequestClaimed(missing.id);
    db.prepare("DELETE FROM accounts WHERE customer_id=1").run();
    assert.throws(() => approveWechatTopupRequest(review(missing.id)), /Account not found/);
    assert.equal(db.prepare("SELECT COUNT(*) FROM transactions").pluck().get(), 1);
    assert.deepEqual(db.prepare("SELECT status,approved_transaction_id FROM wechat_topup_requests WHERE id=?").get(missing.id), {status:"pending",approved_transaction_id:null});
    assert.throws(create, /unavailable/);
    db.exec("INSERT INTO accounts(customer_id,balance) VALUES(1,3500)");
    db.prepare("UPDATE wechat_topup_requests SET expires_at=datetime('now','-1 minute') WHERE id=?").run(missing.id);
    approveWechatTopupRequest(review(missing.id));
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(),6500);

    const runChild = (source: string) => {
      const { promise, resolve, reject } = Promise.withResolvers<string>();
      const child = spawn(process.execPath, ["--import","tsx","-e",source], { env:process.env });
      let text = ""; let errors = "";
      child.stdout.on("data", chunk => { text += chunk; });
      child.stderr.on("data", chunk => { errors += chunk; });
      child.on("error",reject);
      child.on("close",code => code === 0 ? resolve(text.trim()) : reject(new Error(errors)));
      return promise;
    };
    const imports = `const {createWechatTopupRequest,approveWechatTopupRequest} = require('./lib/repositories/wechat-topup-requests.ts');`;
    const reservations = await Promise.all([1,2].map(() => runChild(imports + `console.log(createWechatTopupRequest({customerId:1,requestedAmount:3000,createdByUserId:'child',createdByName:'Child'}).payable_amount)`)));
    assert.equal(new Set(reservations).size,2);
    const simultaneous = create();
    markWechatTopupRequestClaimed(simultaneous.id);
    const outcomes = await Promise.all([1,2].map(() => runChild(imports + `try{approveWechatTopupRequest({requestId:${simultaneous.id},reviewedByUserId:'child',reviewedByName:'Child'});console.log('approved')}catch(e){if(!e.message.includes('no longer'))throw e;console.log('refused')}`)));
    assert.deepEqual(outcomes.sort(),["approved","refused"]);
    assert.equal(db.prepare("SELECT COUNT(*) FROM transactions WHERE description LIKE ?").pluck().get(`WCP request #${simultaneous.id}%`),1);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(),9500);

    const capacityRequest = () => createWechatTopupRequest({ customerId:1, requestedAmount:4000, createdByUserId:"capacity", createdByName:"Capacity" });
    const reserved = Array.from({length:99}, capacityRequest);
    assert.equal(reserved[0].payable_amount,4001);
    assert.equal(reserved[98].payable_amount,4099);
    assert.throws(capacityRequest,/Too many active requests/);
    const queueIds = new Set(listWechatTopupRequests({pendingOnly:true}).map(request => request.id));
    for (const request of reserved) assert.ok(queueIds.has(request.id));
    rejectWechatTopupRequest(review(reserved[0].id));
    const reused = capacityRequest();
    assert.equal(reused.payable_amount,4001);
    assert.deepEqual(listWechatTopupRequests({pendingOnly:true,limit:1}).map(request => request.id),[reused.id]);
    markWechatTopupRequestClaimed(reserved[1].id);
    assert.deepEqual(listWechatTopupRequests({pendingOnly:true,limit:1}).map(request => request.id),[reserved[1].id]);
    const insertApproved = db.prepare("INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,status,created_by_user_id,expires_at,reviewed_at) VALUES(1,100,101,'approved','history','2020-01-01','2020-01-01')");
    db.transaction(() => { for (let index = 0; index < 51; index++) insertApproved.run(); })();
    const newestRejection = create();
    rejectWechatTopupRequest(review(newestRejection.id));
    const history = listWechatTopupRequests();
    assert.equal(history.length, 50);
    assert.equal(history[0].id, newestRejection.id);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.WCP_TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.WCP_TELEGRAM_CHAT_ID;
    try {
      await notifyWechatTopupRequestClaimed(first);
    } finally {
      if (token !== undefined) process.env.TELEGRAM_BOT_TOKEN = token;
      if (chat !== undefined) process.env.WCP_TELEGRAM_CHAT_ID = chat;
    }

    closeDb();
    const historical = new Database(process.env.DATABASE_PATH!);
    historical.exec("DROP INDEX idx_wechat_topup_requests_pending_payable");
    historical.exec("INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,created_by_user_id,expires_at) VALUES(1,1000,1099,'old',datetime('now','+5 minutes')),(1,1000,1099,'old',datetime('now','+5 minutes')),(1,1000,1098,'old',datetime('now','-5 minutes'))");
    historical.close();
    assert.throws(() => getDb(), /1099/);
    closeDb();
    const inspect = new Database(process.env.DATABASE_PATH!);
    assert.equal(inspect.prepare("SELECT COUNT(*) FROM wechat_topup_requests WHERE payable_amount=1099 AND status='pending'").pluck().get(),2);
    assert.equal(inspect.prepare("SELECT status FROM wechat_topup_requests WHERE payable_amount=1098").pluck().get(),"pending");
    inspect.close();
  } finally {
    closeDb();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
