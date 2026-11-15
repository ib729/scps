import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeSignupAttempt } from "./signup-rate-limit";

test("one client consumes five attempts across successful signups and resets exactly at ten minutes", t => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(consumeSignupAttempt("client-a"), true);
  assert.equal(consumeSignupAttempt("client-a"), false);
  assert.equal(consumeSignupAttempt("client-b"), true);
  now += 599_999;
  assert.equal(consumeSignupAttempt("client-a"), false);
  now += 1;
  assert.equal(consumeSignupAttempt("client-a"), true);
});
