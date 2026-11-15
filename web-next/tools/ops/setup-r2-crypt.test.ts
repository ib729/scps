import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const web = path.resolve(import.meta.dirname, "../..");

test("crypt setup preserves literal credentials and never prints them, including command failures", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps crypt ' "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, "args.jsonl");
  fs.writeFileSync(path.join(directory, "rclone"), `#!${process.execPath}\nconst fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(process.env.ARGS_LOG,JSON.stringify(args)+'\\n'); if(args[0]==='listremotes')process.exit(0); if(process.env.FAIL_CONFIG==='1'){console.error(args.join(' '));process.exit(19)}\n`, { mode: 0o700 });
  const secrets = ["crypt '$; password", "salt $` secret", "R2 '$; secret"];
  const run = (fail: boolean) => spawnSync(process.execPath, ["--import", "tsx", "tools/ops/setup-r2-crypt.ts"], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, ARGS_LOG: log, FAIL_CONFIG: fail ? "1" : "0", RCLONE_REMOTE: "raw space", RCLONE_CRYPT_REMOTE: "crypt space", R2_PATH: "bucket ' path" },
    input: `${secrets[0]}\n${secrets[1]}\naccount-id\naccess-id\n${secrets[2]}\n`, encoding: "utf8", timeout: 15_000,
  });
  const success = run(false);
  assert.equal(success.status, 0, success.stdout + success.stderr);
  const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
  const raw = calls.find(args => args[1] === "create" && args[2] === "raw space");
  const crypt = calls.find(args => args[1] === "create" && args[2] === "crypt space");
  assert.ok(raw);
  assert.ok(crypt);
  assert.equal(raw[raw.indexOf("secret_access_key") + 1], secrets[2]);
  assert.equal(crypt[crypt.indexOf("password") + 1], secrets[0]);
  assert.equal(crypt[crypt.indexOf("password2") + 1], secrets[1]);
  assert.equal(crypt[crypt.indexOf("remote") + 1], "raw space:bucket ' path");
  const failure = run(true);
  assert.equal(failure.status, 19);
  for (const result of [success, failure]) for (const secret of secrets) assert.equal((result.stdout + result.stderr).includes(secret), false);
});

test("a failed crypt reconfiguration does not delete the existing decryption configuration", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps crypt preserved "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const saved = path.join(directory, "existing-key");
  fs.writeFileSync(saved, "previous decryption configuration");
  fs.writeFileSync(path.join(directory, "rclone"), `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2);
if(args[0]==='listremotes'){console.log('r2:\\nr2-crypt:');process.exit(0);}
if(args[0]==='config'&&args[1]==='delete'){fs.unlinkSync(${JSON.stringify(saved)});process.exit(0);}
if(args[0]==='config'&&args[1]==='create')process.exit(19);
throw new Error('Unexpected command');
`, { mode: 0o700 });
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/setup-r2-crypt.ts"], {
    cwd: web, env: { ...process.env, PATH: directory, RCLONE_REMOTE: "r2", RCLONE_CRYPT_REMOTE: "r2-crypt" },
    input: "new fixture password\nnew fixture salt\n", encoding: "utf8", timeout: 15_000,
  });
  assert.equal(result.status, 19, result.stderr);
  assert.equal(fs.readFileSync(saved, "utf8"), "previous decryption configuration");
  assert.doesNotMatch(result.stdout, /Configured R2 remotes successfully/);
});
