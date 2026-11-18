import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyUpdate, checkForUpdate, finishUpdate } from "./release-update";

for (const scenario of ["updated", "current", "build", "baseline", "candidate", "restart", "rollback"] as const) {
  test(`background update: ${scenario}`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-update-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const baseline = path.join(directory, "checkout");
    const candidate = path.join(directory, "release");
    const current = path.join(directory, "current");
    const trial = path.join(directory, "trial");
    const request = path.join(directory, "request");
    fs.mkdirSync(baseline);
    fs.mkdirSync(candidate);
    fs.symlinkSync(baseline, current);
    fs.writeFileSync(request, "operator-id");
    const target = () => fs.realpathSync(fs.existsSync(trial) ? trial : current);
    const restarted: string[] = [];
    const ops = {
      directory, trial,
      async prepare(previous: string, stage: (message: string) => void) {
        assert.equal(previous, baseline);
        assert.equal(target(), baseline);
        stage("Building");
        if (scenario === "build") throw new Error("Build failed");
        if (scenario === "current") return null;
        return { directory: candidate, revision: "new-revision" };
      },
      async restart() {
        restarted.push(target());
        if (scenario === "restart" && restarted.length === 1) throw new Error("Restart failed");
      },
      async healthy(expected: string) {
        assert.equal(target(), expected);
        if (expected === candidate) return scenario !== "candidate" && scenario !== "rollback";
        return scenario !== "baseline" && !(scenario === "rollback" && restarted.length > 0);
      },
    };
    const succeeded = scenario === "updated" || scenario === "current";
    if (succeeded) await applyUpdate(ops);
    else await assert.rejects(applyUpdate(ops));
    await finishUpdate(ops, succeeded);
    const status = JSON.parse(fs.readFileSync(path.join(directory, "status.json"), "utf8"));
    assert.equal(status.state, succeeded ? scenario : scenario === "rollback" ? "rollback_failed" : scenario === "candidate" || scenario === "restart" ? "rolled_back" : "failed");
    assert.equal(fs.realpathSync(current), scenario === "updated" ? candidate : baseline);
    assert.equal(fs.existsSync(trial), false);
    assert.equal(fs.existsSync(request), false);
    assert.deepEqual(restarted, scenario === "updated" ? [candidate] : ["candidate", "restart", "rollback"].includes(scenario) ? [candidate, baseline] : []);
  });
}

test("scheduled checks persist availability, skip for 30 days, and never queue an install", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-check-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const day = 86_400_000;
  const installed = "a".repeat(40);
  const upstream = "b".repeat(40);
  const state = path.join(directory, "availability.json");
  const request = path.join(directory, "request");
  const checkUnexpectedly = () => { throw new Error("The checker should not contact Git yet"); };
  checkForUpdate(directory, () => installed, () => upstream, day);
  assert.deepEqual(JSON.parse(fs.readFileSync(state, "utf8")), { checkedAt: day, available: true });
  checkForUpdate(directory, () => installed, checkUnexpectedly, 30 * day);
  fs.writeFileSync(request, "admin");
  checkForUpdate(directory, () => upstream, checkUnexpectedly, 31 * day);
  assert.equal(fs.readFileSync(request, "utf8"), "admin");
  fs.unlinkSync(request);
  checkForUpdate(directory, () => upstream, () => upstream, 31 * day);
  assert.deepEqual(JSON.parse(fs.readFileSync(state, "utf8")), { checkedAt: 31 * day, available: false });
  assert.equal(fs.existsSync(request), false);
});
