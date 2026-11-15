import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const web = path.resolve(import.meta.dirname, "..");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps remote "));
  const home = path.join(directory, "remote home ' $literal");
  const repository = path.join(directory, "repo ' ; $(touch INJECTED) space");
  fs.mkdirSync(home);
  for (const root of [repository, path.join(home, "scps")]) {
    fs.mkdirSync(path.join(root, "web-next/tools/ops"), { recursive: true });
    fs.symlinkSync(path.join(web, "node_modules"), path.join(root, "web-next/node_modules"), "dir");
    fs.writeFileSync(path.join(root, "scps-cli"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.RESULT_LOG, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));\n`, { mode: 0o700 });
    fs.writeFileSync(path.join(root, "web-next/tools/ops/deploy-vps.ts"), "import fs from 'node:fs'; fs.writeFileSync(process.env.RESULT_LOG!, JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2)}));\n");
  }
  const log = path.join(directory, "ssh.json");
  const resultLog = path.join(directory, "result.json");
  fs.writeFileSync(path.join(directory, "ssh"), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(process.env.SSH_LOG, JSON.stringify(args));
if (process.env.SSH_EXIT) process.exit(Number(process.env.SSH_EXIT));
if (process.env.SSH_SIGNAL) process.kill(process.pid, 'SIGTERM');
if (process.env.SSH_WAIT) {
  process.on('SIGTERM', () => { fs.writeFileSync(process.env.RESULT_LOG, 'forwarded'); process.exit(0); });
  fs.watch(process.env.SSH_LOG, () => {});
  console.log('SSH_READY');
} else {
  const result = require('node:child_process').spawnSync('/bin/sh', ['-c', args[args.length - 1]], { stdio: 'inherit', cwd: process.env.HOME });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exit(result.status ?? 1);
}
`, { mode: 0o700 });
  const run = (script: string, args: string[], env: Partial<NodeJS.ProcessEnv> = {}, input = "") => spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: web, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, HOME: home, SSH_LOG: log, RESULT_LOG: resultLog,
      SCPS_VPS_HOST: "example.invalid", SCPS_VPS_USER: "operator", SCPS_VPS_DIR: repository, SCPS_VPS_PORT: "2202", SCPS_VPS_SSH_KEY: "", SCPS_REMOTE_PATH: repository, ...env },
    input, encoding: "utf8", timeout: 15_000,
  });
  return { directory, home, repository, log, resultLog, run };
}

test("remote CLI sends every argument literally through a real POSIX shell", () => {
  const f = fixture();
  const args = ["customers", "with spaces", "O'Brien", "$(touch INJECTED)", "; touch INJECTED", "", "line\nbreak", "--flag=a&b"];
  const key = path.join(f.directory, "private key ' $(literal)");
  fs.writeFileSync(key, "fixture");
  try {
    const result = f.run("tools/remote-cli.ts", args, { SCPS_VPS_SSH_KEY: key });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")), { cwd: f.repository, args });
    const sshArgs: string[] = JSON.parse(fs.readFileSync(f.log, "utf8"));
    assert.deepEqual(sshArgs.slice(0, -1), ["-p", "2202", "-i", key, "-t", "--", "operator@example.invalid"]);
    assert.equal(fs.existsSync(path.join(f.home, "INJECTED")), false);
    assert.equal(fs.existsSync(path.join(f.repository, "INJECTED")), false);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("remote deploy expands only the default remote HOME prefix, retaining literal branch arguments", () => {
  const f = fixture();
  const branch = "release ' ; $(touch INJECTED)";
  try {
    const result = f.run("tools/ops/deploy-remote.ts", ["operator@example.invalid", branch], { SCPS_REMOTE_PATH: "" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")), { cwd: path.join(f.home, "scps/web-next"), args: [branch] });
    const sshArgs: string[] = JSON.parse(fs.readFileSync(f.log, "utf8"));
    assert.deepEqual(sshArgs.slice(0, -1), ["-t", "--", "operator@example.invalid"]);
    assert.equal(fs.existsSync(path.join(f.home, "scps/web-next/INJECTED")), false);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("an explicit remote directory remains literal, including shell metacharacters", () => {
  const f = fixture();
  try {
    const result = f.run("tools/ops/deploy-remote.ts", ["operator@example.invalid"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")), { cwd: path.join(f.repository, "web-next"), args: ["main"] });
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

for (const script of ["tools/remote-cli.ts", "tools/ops/deploy-remote.ts"]) {
  test(`${script} propagates SSH status, signal, and offers offline help`, () => {
    const f = fixture();
    const args = script.includes("deploy-") ? ["operator@example.invalid"] : [];
    try {
      assert.equal(f.run(script, args, { SSH_EXIT: "43" }).status, 43);
      assert.equal(f.run(script, args, { SSH_SIGNAL: "1" }).signal, "SIGTERM");
      fs.rmSync(f.log);
      const help = f.run(script, ["--help"], { SCPS_VPS_HOST: "" });
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, /Usage:/);
      assert.equal(fs.existsSync(f.log), false);
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  });
}

test("missing host prompts for host and username without losing piped answers", () => {
  const f = fixture();
  try {
    const result = f.run("tools/remote-cli.ts", ["balance"], { SCPS_VPS_HOST: "" }, "manual.invalid\nmanual-user\n");
    assert.equal(result.status, 0, result.stderr);
    const sshArgs: string[] = JSON.parse(fs.readFileSync(f.log, "utf8"));
    assert.equal(sshArgs.at(-2), "manual-user@manual.invalid");
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")).args, ["balance"]);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

for (const env of [{ SCPS_VPS_HOST: "-oProxyCommand=bad" }, { SCPS_VPS_PORT: "22 -oBad=yes" }, { SCPS_VPS_USER: "bad@other" }]) {
  test(`invalid SSH connection configuration is rejected before invoking SSH: ${JSON.stringify(env)}`, () => {
    const f = fixture();
    try {
      assert.notEqual(f.run("tools/remote-cli.ts", [], env).status, 0);
      assert.equal(fs.existsSync(f.log), false);
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  });
}

test("dotenv settings are package-relative and exported configuration takes precedence", () => {
  const f = fixture();
  try {
    const copied = path.join(f.repository, "web-next/tools/remote-cli.ts");
    fs.copyFileSync(path.join(web, "tools/remote-cli.ts"), copied);
    fs.writeFileSync(path.join(f.repository, "web-next/.env.local"), `SCPS_VPS_HOST=file.invalid\nSCPS_VPS_USER=file-user\nSCPS_VPS_PORT=2211\nSCPS_VPS_DIR=${JSON.stringify(f.repository)}\n`);
    const result = f.run(copied, ["accounts"], { SCPS_VPS_HOST: "exported.invalid", SCPS_VPS_USER: undefined, SCPS_VPS_PORT: undefined, SCPS_VPS_DIR: undefined });
    assert.equal(result.status, 0, result.stderr);
    const sshArgs: string[] = JSON.parse(fs.readFileSync(f.log, "utf8"));
    assert.deepEqual(sshArgs.slice(0, -1), ["-p", "2211", "-t", "--", "file-user@exported.invalid"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")), { cwd: f.repository, args: ["accounts"] });
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("a symlinked entrypoint still opens the remote CLI", () => {
  const f = fixture();
  try {
    const linked = path.join(f.directory, "remote link.ts");
    fs.symlinkSync(path.join(web, "tools/remote-cli.ts"), linked);
    const result = f.run(linked, ["status"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.resultLog, "utf8")).args, ["status"]);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("SIGTERM reaches the owned SSH child and remains a signal even if that child exits zero", async () => {
  const f = fixture();
  const child = spawn(process.execPath, ["--import", "tsx", "tools/remote-cli.ts"], {
    cwd: web,
    env: { ...process.env, PATH: `${f.directory}:${process.env.PATH}`, HOME: f.home, SSH_LOG: f.log, RESULT_LOG: f.resultLog, SSH_WAIT: "1", SCPS_VPS_HOST: "fixture.invalid", SCPS_VPS_USER: "operator", SCPS_VPS_DIR: f.repository, SCPS_VPS_PORT: "22", SCPS_VPS_SSH_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"], timeout: 15_000, killSignal: "SIGKILL",
  });
  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<{ status: number | null; signal: NodeJS.Signals | null }>();
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (data: string) => {
    output += data;
    if (output.includes("SSH_READY")) ready.resolve();
  });
  child.stderr.setEncoding("utf8").on("data", (data: string) => { output += data; });
  child.once("error", error => { ready.reject(error); closed.reject(error); });
  child.once("close", (status, signal) => {
    ready.reject(new Error(`SSH closed before readiness: ${output}`));
    closed.resolve({ status, signal });
  });
  try {
    await ready.promise;
    child.kill("SIGTERM");
    assert.deepEqual(await closed.promise, { status: null, signal: "SIGTERM" });
    assert.equal(fs.readFileSync(f.resultLog, "utf8"), "forwarded");
  } finally {
    child.kill("SIGKILL");
    await closed.promise;
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});
