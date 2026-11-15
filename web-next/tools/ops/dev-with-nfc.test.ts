import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = fileURLToPath(new URL("../../", import.meta.url));

test("failed broadcaster stop aborts development startup before reset, probing or web launch", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nfc dev ownership "));
  const log = path.join(directory, "privileged-calls");
  try {
    const scripts: Record<string, string> = {
      ls: "console.log('ttyUSB0');",
      udevadm: "console.log('ID_VENDOR_ID=1a86');",
      systemctl: "console.log(process.argv.includes('LoadState')?'loaded':'inactive');",
      sudo: `require('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[2]==='systemctl'&&process.argv[3]==='stop')process.exit(7);throw new Error('UNEXPECTED_PRIVILEGED_OPERATION');`,
    };
    for (const [name, body] of Object.entries(scripts)) await fs.writeFile(path.join(directory, name), `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/dev-with-nfc.ts"], { cwd: web, env: { ...process.env, PATH: directory, DATABASE_PATH: path.join(directory, "must-not-open.db") }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 7, result.stderr);
    const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ["systemctl", "stop", "tap-broadcaster.service", "tap-broadcaster-reader2.service"]);
    await assert.rejects(fs.stat(path.join(directory, "must-not-open.db")), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
