import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const web = path.resolve(import.meta.dirname, "../..");
const script = pathToFileURL(path.join(import.meta.dirname, "auto-update.ts")).href;

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps auto update "));
  const calls = path.join(directory, "calls");
  const log = path.join(directory, "update.log");
  const failures = path.join(directory, "failures");
  fs.writeFileSync(path.join(directory, "apt"), `#!${process.execPath}
require('node:fs').appendFileSync(process.env.CALL_LOG, process.argv.slice(2).join(' ') + '\\n');
console.log('package manager output');
if (process.argv[2] === process.env.FAIL_APT) process.exit(29);
`, { mode: 0o700 });
  const run = (env: Partial<NodeJS.ProcessEnv> = {}) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `import { autoUpdate } from ${JSON.stringify(script)}; try { await autoUpdate(${JSON.stringify(log)}, ${JSON.stringify(failures)}); } catch (error) { console.error(error.message); process.exitCode = error.status ?? 1; }`], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, CALL_LOG: calls, ...env }, encoding: "utf8", timeout: 15_000,
  });
  return { directory, calls, log, failures, run };
}

test("three failed updates trip the persistent gate without another package mutation", () => {
  const f = fixture();
  try {
    for (let count = 1; count <= 3; count++) {
      const failed = f.run({ FAIL_APT: "update" });
      assert.equal(failed.status, 29, failed.stderr);
      assert.equal(fs.readFileSync(f.failures, "utf8").trim(), String(count));
    }
    assert.equal(f.run().status, 1);
    assert.equal(fs.readFileSync(f.calls, "utf8"), "update\nupdate\nupdate\n");
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("successful update clears failures and records all apt output", () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.failures, "2\n");
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(f.calls, "utf8"), "update\nupgrade -y\nautoremove -y\nautoclean\n");
    assert.equal(fs.existsSync(f.failures), false);
    assert.match(fs.readFileSync(f.log, "utf8"), /package manager output/);
    assert.match(fs.readFileSync(f.log, "utf8"), /completed successfully/);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

for (const step of ["upgrade", "autoremove", "autoclean"]) {
  test(`failed ${step} is never reported as a successful system update`, () => {
    const f = fixture();
    try {
      const result = f.run({ FAIL_APT: step });
      assert.equal(result.status, 29, result.stderr);
      assert.equal(fs.readFileSync(f.failures, "utf8").trim(), "1");
      assert.doesNotMatch(fs.readFileSync(f.log, "utf8"), /completed successfully/);
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  });
}

test("offline help performs no package or log mutations", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/auto-update.ts", "--help"], { cwd: web, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
});
