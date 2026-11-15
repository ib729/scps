import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = fileURLToPath(new URL("../../", import.meta.url));

test("unsupported Node versions never install/rebuild while the supported minimum uses frozen dependencies", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "build prerequisites "));
  const log = path.join(directory, "installs");
  try {
    const bodies: Record<string, string> = {
      node: "console.log(process.env.PROBE_NODE_VERSION);",
      python3: "console.log('Python 3.11.10');",
      pnpm: `if(process.argv[2]==='--version')console.log('12.21.0');else require('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');`,
    };
    for (const command of ["gcc", "g++", "make", "pkg-config", "xcodebuild"]) bodies[command] = "console.log('build tool fixture');";
    for (const [command, body] of Object.entries(bodies)) await fs.writeFile(path.join(directory, command), `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
    for (const version of ["v26.12.9", "v26.13.0", "v27.0.0"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web-next-setup.ts"], { cwd: web, env: { ...process.env, PATH: directory, PROBE_NODE_VERSION: version }, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 1, result.stderr);
      await assert.rejects(fs.stat(log), { code: "ENOENT" });
    }
    const ready = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web-next-setup.ts"], { cwd: web, env: { ...process.env, PATH: directory, PROBE_NODE_VERSION: "v26.13.1" }, encoding: "utf8", timeout: 10000 });
    assert.equal(ready.status, 0, ready.stderr);
    assert.deepEqual((await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line)), [["install", "--frozen-lockfile"], ["rebuild", "better-sqlite3"]]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
