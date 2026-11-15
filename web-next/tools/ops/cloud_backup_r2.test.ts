import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const web = path.resolve(import.meta.dirname, "../..");

test("cloud backup refuses a missing encrypted remote before creating an archive", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps cloud remotes "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "rclone"), "#!/bin/sh\nif [ \"$1\" = listremotes ]; then printf 'raw-test:\\n'; else exit 99; fi\n", { mode: 0o700 });
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/cloud_backup_r2.ts"], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, RCLONE_REMOTE: "raw-test", RCLONE_CRYPT_REMOTE: "missing-crypt", DATABASE_PATH: path.join(directory, "missing.db") }, encoding: "utf8", timeout: 15_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing-crypt/);
  assert.doesNotMatch(result.stderr, /SQLite database|ENOENT.*missing.db/);
});
