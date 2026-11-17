import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePosDefaultMode } from "./pos-preferences";

test("defaults unconfigured modes to manual and preserves saved modes", () => {
  for (const value of [null, undefined, "", "invalid"]) {
    assert.equal(parsePosDefaultMode(value), "manual");
  }
  assert.equal(parsePosDefaultMode("tap-first"), "tap-first");
  assert.equal(parsePosDefaultMode("manual"), "manual");
});
