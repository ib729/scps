import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const web = path.resolve(import.meta.dirname, "../..");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps deploy "));
  const log = path.join(directory, "calls.jsonl");
  for (const name of ["git", "pnpm", "sudo", "systemctl"]) {
    fs.writeFileSync(path.join(directory, name), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ name, args, cwd: process.cwd() }) + '\\n');
if (name === 'sudo') {
  const result = require('node:child_process').spawnSync(args[0], args.slice(1), { stdio: 'inherit' });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exit(result.status ?? 1);
} else if (name === 'git' && args[0] === 'status') console.log(process.env.DIRTY || '');
else if (name === 'git' && args[0] === 'branch') console.log(process.env.CURRENT_BRANCH || 'main');
else if (name === 'git' && args[0] === 'show-ref') process.exit(Number(process.env.REF_STATUS || 0));
if (name + ':' + args.join(' ') === process.env.FAIL_COMMAND) process.exit(37);
if (name + ':' + args.join(' ') === process.env.SIGNAL_COMMAND) process.kill(process.pid, 'SIGTERM');
`, { mode: 0o700 });
  }
  const run = (args: string[] = [], env: Partial<NodeJS.ProcessEnv> = {}) => spawnSync(process.execPath, ["--import", "tsx", "tools/ops/deploy-vps.ts", ...args], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, CALL_LOG: log, ...env }, encoding: "utf8", timeout: 15_000,
  });
  const calls = (): { name: string; args: string[]; cwd: string }[] => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  return { directory, run, calls };
}

test("dirty deploy refuses before fetching, installing or restarting", () => {
  const f = fixture();
  try {
    const result = f.run([], { DIRTY: " M ledger" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /dirty working tree/);
    assert.deepEqual(f.calls().map(call => [call.name, ...call.args]), [["git", "status", "--porcelain"]]);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("default main deploy fast-forwards, frozen-installs, builds and only then restarts", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.calls().filter(call => call.name !== "sudo").map(call => [call.name, ...call.args]), [
      ["git", "status", "--porcelain"], ["git", "fetch", "origin"], ["git", "branch", "--show-current"],
      ["git", "pull", "--ff-only", "origin", "main"], ["pnpm", "--dir", web, "install", "--frozen-lockfile"],
      ["pnpm", "--dir", web, "build"], ["systemctl", "restart", "scps"], ["systemctl", "--no-pager", "--full", "status", "scps"],
    ]);
    assert.ok(f.calls().every(call => call.cwd === path.dirname(web)));
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

for (const command of ["git:fetch origin", "git:pull --ff-only origin main", `pnpm:--dir ${web} install --frozen-lockfile`, `pnpm:--dir ${web} build`]) {
  test(`${command} failure preserves status and never restarts`, () => {
    const f = fixture();
    try {
      const result = f.run([], { FAIL_COMMAND: command });
      assert.equal(result.status, 37, result.stderr);
      assert.ok(!f.calls().some(call => call.name === "sudo" || call.name === "systemctl"));
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  });
}

test("a command killed by a signal terminates deploy with that signal", () => {
  const f = fixture();
  try {
    const result = f.run([], { SIGNAL_COMMAND: "git:fetch origin" });
    assert.equal(result.signal, "SIGTERM", result.stderr);
    assert.ok(!f.calls().some(call => call.name === "systemctl"));
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

for (const ref of ["0", "1", "42"]) {
  test(`branch checkout handles show-ref status ${ref} without hiding errors`, () => {
    const f = fixture();
    try {
      const result = f.run(["release"], { CURRENT_BRANCH: "old", REF_STATUS: ref });
      assert.equal(result.status, ref === "42" ? 42 : 0, result.stderr);
      const checkout = f.calls().find(call => call.args[0] === "checkout");
      if (ref === "42") assert.equal(checkout, undefined);
      else assert.deepEqual(checkout?.args, ref === "0" ? ["checkout", "release"] : ["checkout", "-b", "release", "--track", "origin/release"]);
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  });
}

test("help is local and makes no OS calls", () => {
  const f = fixture();
  try {
    const result = f.run(["--help"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    assert.deepEqual(f.calls(), []);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
