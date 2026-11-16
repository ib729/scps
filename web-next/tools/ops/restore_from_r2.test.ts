import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const web = path.resolve(import.meta.dirname, "../..");

test("restore rejects unsafe names, missing writer assertion, active or unverified service state before downloading", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps restore guards "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const called = path.join(directory, "downloaded");
  fs.writeFileSync(path.join(directory, "rclone"), `#!/bin/sh\ntouch '${called}'\nexit 99\n`, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, "systemctl"), "#!/bin/sh\nprintf 'active\\n'\nexit 0\n", { mode: 0o700 });
  for (const args of [["../escape.tar.zst", "--writers-stopped"], ["safe.tar.zst"], ["safe.tar.zst", "--writers-stopped"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/restore_from_r2.ts", ...args], {
      cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(called), false);
  }
  fs.writeFileSync(path.join(directory, "systemctl"), "#!/bin/sh\ncase \"$*\" in *LoadState*) echo loaded;; *stuco-web.service*) echo active;; *) echo inactive;; esac\n", { mode: 0o700 });
  const legacyActive = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/restore_from_r2.ts", "safe.tar.zst", "--writers-stopped"], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
  });
  assert.notEqual(legacyActive.status, 0);
  assert.equal(fs.existsSync(called), false);
  for (const [state, status] of [["inactive", 7], ["unknown", 0], ["", 0]] as const) {
    fs.writeFileSync(path.join(directory, "systemctl"), `#!${process.execPath}\nconsole.log(${JSON.stringify(state)});process.exit(${status});\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/restore_from_r2.ts", "safe.tar.zst", "--writers-stopped"], {
      cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(called), false, `Unverified service state ${state}/${status} must not download`);
  }
});
