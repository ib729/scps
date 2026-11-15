import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { parse } from "dotenv";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scps setup ' % "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const name of ["web-next/tools/ops/setup-debian.ts", "web-next/lib/database-path.ts", "migrations/schema.sql", "web-next/migrations/better_auth_schema.sql", "web-next/.env.local.example", "systemd/stuco-web.service", "systemd/tap-broadcaster.service", "systemd/tap-broadcaster-reader2.service"]) {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(sourceRoot, name), destination);
  }
  const web = path.join(root, "web-next");
  await fs.symlink(path.join(sourceRoot, "web-next/node_modules"), path.join(web, "node_modules"), "dir");
  const binaries = path.join(root, "bin");
  await fs.mkdir(binaries);
  const env = { ...process.env };
  delete env.DATABASE_PATH;
  delete env.SUDO_USER;
  return { root, web, binaries, env };
}

async function probe(web: string, content: string, cwd: string, env: NodeJS.ProcessEnv) {
  const script = path.join(web, "tools/setup-probe.ts");
  await fs.writeFile(script, content);
  return spawnSync(process.execPath, ["--import", loader, script], { cwd, env, encoding: "utf8", timeout: 20000 });
}

test("user commands retain the pinned tool path even when sudo strips PATH", async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.binaries, "sudo"), "#!/bin/sh\nshift; shift\nexec env -i PATH=/usr/bin:/bin \"$@\"\n", { mode: 0o700 });
  await fs.writeFile(path.join(f.binaries, "scps-runtime-probe"), "#!/bin/sh\nprintf pinned-tool\n", { mode: 0o700 });
  const result = await probe(f.web, 'import { runAsUser } from "./ops/setup-debian"; runAsUser("scps-runtime-probe", []);', f.root, { ...f.env, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "pinned-tool");
});

test("setup from either cwd keeps one quoted canonical database and preserves customer/auth rows on its second call", async t => {
  const f = await fixture(t);
  const envFile = path.join(f.web, ".env.local");
  const target = path.join(f.web, "private dir/ledger.db");
  await fs.writeFile(envFile, 'DATABASE_PATH="private dir/ledger.db"\nEXAMPLE=old\nEXAMPLE=second\n');
  for (const [index, cwd] of [f.root, f.web].entries()) {
    const result = await probe(f.web, 'import { configureDatabase, ensureEnvValue } from "./ops/setup-debian"; configureDatabase(); ensureEnvValue("EXAMPLE", "updated");', cwd, f.env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(parse(await fs.readFile(envFile)).DATABASE_PATH, target);
    assert.match(await fs.readFile(envFile, "utf8"), /EXAMPLE=updated\nEXAMPLE=second\n/);
    const db = new Database(target);
    try {
      assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE name='session'").get());
      if (index === 0) {
        db.exec("INSERT INTO customers(id,name) VALUES(1,'preserved'); INSERT INTO user(id,name,email) VALUES('saved','Saved','saved@example.test'); INSERT INTO account(id,userId,accountId,providerId,password) VALUES('credential','saved','saved','credential','fixture-hash'); INSERT INTO session(id,userId,token,expiresAt) VALUES('session','saved','fixture-token',4102444800);");
      } else {
        assert.deepEqual(db.prepare("SELECT name FROM customers WHERE id=1").get(), { name: "preserved" });
        assert.deepEqual(db.prepare("SELECT password FROM account WHERE id='credential'").get(), { password: "fixture-hash" });
        assert.deepEqual(db.prepare("SELECT token FROM session WHERE id='session'").get(), { token: "fixture-token" });
      }
    } finally { db.close(); }
    await assert.rejects(fs.stat(path.join(f.root, "stuco.db")), { code: "ENOENT" });
    await assert.rejects(fs.stat(path.join(f.web, "stuco.db")), { code: "ENOENT" });
  }
});

test("typed setup renders both reader units safely and never prints the generated auth secret", async t => {
  const f = await fixture(t);
  const units = path.join(f.root, "rendered-units");
  const log = path.join(f.root, "commands");
  await fs.mkdir(units);
  const fakeSudo = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
if(args[0]==='-u'){const result=cp.spawnSync(args[2],args.slice(3),{env:{...process.env,PATH:'/usr/bin:/bin'},stdio:'inherit'});if(result.signal)process.kill(process.pid,result.signal);else process.exit(result.status??1);}
else if(args[0]==='tee'&&args[1].startsWith('/etc/systemd/system/'))fs.writeFileSync(path.join(${JSON.stringify(units)},path.basename(args[1])),fs.readFileSync(0));
else if(args[0]!=='systemctl')throw new Error('Unexpected privileged command: '+args);
`;
  await fs.writeFile(path.join(f.binaries, "sudo"), fakeSudo, { mode: 0o700 });
  await fs.writeFile(path.join(f.binaries, "pnpm"), `#!${process.execPath}\nrequire(${JSON.stringify(path.join(f.web, "node_modules/dotenv"))}).config({path:${JSON.stringify(path.join(f.web, ".env.local"))},quiet:true});\nif(!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET==='replace-with-a-random-secret'){console.error('Build inherited a stale auth secret');process.exit(41);}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(['pnpm',...process.argv.slice(2)])+'\\n');\n`, { mode: 0o700 });
  const result = await probe(f.web, `import fs from 'node:fs';
const read=fs.readFileSync;fs.readFileSync=((file,...args)=>String(file)==='/etc/os-release'?'ID=debian\\n':Reflect.apply(read,fs,[file,...args])) as typeof fs.readFileSync;
import { main } from './ops/setup-debian';
Promise.resolve().then(()=>main([])).then(code=>{process.exitCode=code??0}).catch(error=>{console.error(error);process.exitCode=1});`, f.root, { ...f.env, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
  assert.equal(result.status, 0, result.stderr);
  const env = parse(await fs.readFile(path.join(f.web, ".env.local")));
  assert.ok(env.BETTER_AUTH_SECRET.length >= 40);
  assert.notEqual(env.BETTER_AUTH_SECRET, "replace-with-a-random-secret");
  assert.ok(!(result.stdout + result.stderr).includes(env.BETTER_AUTH_SECRET));
  assert.equal((await fs.stat(path.join(f.web, ".env.local"))).mode & 0o777, 0o600);
  const escapedRoot = f.root.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  for (const [name, usb, lane] of [["tap-broadcaster.service", "USB0", "reader-1"], ["tap-broadcaster-reader2.service", "USB1", "reader-2"]]) {
    const unit = await fs.readFile(path.join(units, name), "utf8");
    assert.ok(unit.includes(`WorkingDirectory="${escapedRoot}/web-next"`));
    assert.ok(unit.includes(`tools/ops/reset-usb-nfc.ts ${usb}`));
    assert.ok(unit.includes(`POS_LANE_ID=${lane}`));
    assert.match(unit, /TimeoutStopSec=10/);
    assert.doesNotMatch(unit, /YOUR_USERNAME|__REPO_ROOT__|\.py|\.venv/);
    if (usb === "USB1") assert.match(unit, /ExecStartPre=\/bin\/sleep 5/);
  }
  const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.ok(calls.some(args => args.join(" ") === "systemctl restart stuco-web.service"));
  assert.ok(!calls.some(args => args[0] === "systemctl" && args.some(arg => arg.startsWith("tap-broadcaster"))));
});
