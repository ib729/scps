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
  for (const name of ["web-next/tools/ops/setup-host.ts", "web-next/tools/ops/setup-https.ts", "web-next/lib/database-path.ts", "web-next/lib/school-settings.ts", "migrations/schema.sql", "web-next/migrations/better_auth_schema.sql", "web-next/.env.local.example", "systemd/scps.service", "systemd/scps-reader.service", "systemd/scps-reader2.service"]) {
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
  const result = await probe(f.web, 'import { runAsUser } from "./ops/setup-host"; runAsUser("scps-runtime-probe", []);', f.root, { ...f.env, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "pinned-tool");
});

test("setup from either cwd keeps one quoted canonical database and preserves customer/auth rows on its second call", async t => {
  const f = await fixture(t);
  const envFile = path.join(f.web, ".env.local");
  const target = path.join(f.web, "private dir/ledger.db");
  await fs.writeFile(envFile, 'DATABASE_PATH=wrong.db\nexport DATABASE_PATH = \"private dir/ledger.db\"\nEXAMPLE=old\nEXAMPLE=second\n');
  for (const [index, cwd] of [f.root, f.web].entries()) {
    const result = await probe(f.web, 'import { configureDatabase, ensureEnvValue } from "./ops/setup-host"; configureDatabase(); ensureEnvValue("EXAMPLE", "updated");', cwd, f.env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(parse(await fs.readFile(envFile)).DATABASE_PATH, target);
    assert.match(await fs.readFile(envFile, "utf8"), /EXAMPLE=updated\n/);
    assert.equal((await fs.readFile(envFile, "utf8")).match(/EXAMPLE=/g)?.length, 1);
    assert.equal((await fs.readFile(envFile, "utf8")).match(/DATABASE_PATH/g)?.length, 1);
    const db = new Database(target);
    try {
      assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE name='session'").get());
      const schoolYear = db.prepare("SELECT value FROM app_meta WHERE key = 'school_year'").pluck();
      if (index === 0) {
        const year = new Date().getFullYear();
        assert.equal(schoolYear.get(), `${year}-${year + 1}`);
        db.exec("UPDATE app_meta SET value = 'Custom year' WHERE key = 'school_year'");
        db.exec("INSERT INTO customers(id,name) VALUES(1,'preserved'); INSERT INTO user(id,name,email) VALUES('saved','Saved','saved@example.test'); INSERT INTO account(id,userId,accountId,providerId,password) VALUES('credential','saved','saved','credential','fixture-hash'); INSERT INTO session(id,userId,token,expiresAt) VALUES('session','saved','fixture-token',4102444800);");
      } else {
        assert.equal(schoolYear.get(), "Custom year");
        assert.deepEqual(db.prepare("SELECT name FROM customers WHERE id=1").get(), { name: "preserved" });
        assert.deepEqual(db.prepare("SELECT password FROM account WHERE id='credential'").get(), { password: "fixture-hash" });
        assert.deepEqual(db.prepare("SELECT token FROM session WHERE id='session'").get(), { token: "fixture-token" });
      }
    } finally { db.close(); }
    await assert.rejects(fs.stat(path.join(f.root, "stuco.db")), { code: "ENOENT" });
    await assert.rejects(fs.stat(path.join(f.web, "stuco.db")), { code: "ENOENT" });
  }
});

test("failed schema leaves no database and corrected setup can initialize it", async t => {
  const f = await fixture(t);
  const schema = path.join(f.root, "migrations/schema.sql");
  const original = await fs.readFile(schema);
  await fs.copyFile(path.join(f.web, ".env.local.example"), path.join(f.web, ".env.local"));
  await fs.writeFile(schema, "invalid sql");
  const script = 'import { configureDatabase } from "./ops/setup-host"; configureDatabase();';
  const failed = await probe(f.web, script, f.root, f.env);
  assert.notEqual(failed.status, 0);
  await assert.rejects(fs.stat(path.join(f.root, "scps.db")), { code: "ENOENT" });
  await fs.writeFile(schema, original);
  const success = await probe(f.web, script, f.root, f.env);
  assert.equal(success.status, 0, success.stderr);
  assert.equal((await fs.stat(path.join(f.root, "scps.db"))).mode & 0o777, 0o600);
});

test("concurrent target is never overwritten during initialization", async t => {
  const f = await fixture(t);
  const target = path.join(f.root, "scps.db");
  const result = await probe(f.web, `import fs from 'node:fs'; import { configureDatabase } from './ops/setup-host';
const link=fs.linkSync; fs.linkSync=((a,b)=>{fs.writeFileSync(b,'concurrent'); return link(a,b);}) as typeof fs.linkSync;
configureDatabase();`, f.root, f.env);
  assert.notEqual(result.status, 0);
  assert.equal(await fs.readFile(target, "utf8"), "concurrent");
});

test("a temporary filename collision does not delete another file", async t => {
  const f = await fixture(t);
  const result = await probe(f.web, `import fs from 'node:fs'; import { configureDatabase } from './ops/setup-host';
const open=fs.openSync; fs.openSync=((file,...args)=>{if(String(file).includes('.scps-init-')) fs.writeFileSync(file,'other'); return Reflect.apply(open,fs,[file,...args]);}) as typeof fs.openSync;
configureDatabase();`, f.root, f.env);
  assert.notEqual(result.status, 0);
  const temporary = (await fs.readdir(f.root)).find(name => name.startsWith(".scps-init-"));
  assert.ok(temporary);
  assert.equal(await fs.readFile(path.join(f.root, temporary), "utf8"), "other");
});

test("duplicate secret assignments converge to runtime value without logging it", async t => {
  const f = await fixture(t);
  const envFile = path.join(f.web, ".env.local");
  await fs.writeFile(envFile, "BETTER_AUTH_SECRET=old\nexport BETTER_AUTH_SECRET = private-value\n# keep\n");
  const result = await probe(f.web, 'import { readEnvValue, ensureEnvValue } from "./ops/setup-host"; ensureEnvValue("BETTER_AUTH_SECRET", readEnvValue("BETTER_AUTH_SECRET"));', f.root, f.env);
  assert.equal(result.status, 0, result.stderr);
  const contents = await fs.readFile(envFile, "utf8");
  assert.equal(parse(contents).BETTER_AUTH_SECRET, "private-value");
  assert.equal(contents.match(/BETTER_AUTH_SECRET/g)?.length, 1);
  assert.ok(contents.includes("# keep"));
  assert.ok(!(result.stdout + result.stderr).includes("private-value"));
});

test("systemd setup preserves installed units on rerun and installs missing readers", async t => {
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
  await fs.writeFile(path.join(f.binaries, "systemctl"), `#!/bin/sh
for name do :; done
case "$*" in
  *Version*) echo 255;;
  *LoadState*) if [ -f "$UNIT_DIR/$name" ]; then echo loaded; else echo not-found; fi;;
  *FragmentPath*) printf '/etc/systemd/system/%s\\n' "$name";;
  *WorkingDirectory*) printf '%s\\n' "$WEB";;
esac
`, { mode: 0o700 });
  await fs.writeFile(path.join(f.binaries, "systemd-analyze"), `#!/bin/sh\ncase "$*" in */etc/systemd/system/*) exit 0;; *) exec /usr/bin/systemd-analyze "$@";; esac\n`, { mode: 0o700 });
  await fs.writeFile(path.join(f.binaries, "pnpm"), `#!${process.execPath}\nrequire(${JSON.stringify(path.join(f.web, "node_modules/dotenv"))}).config({path:${JSON.stringify(path.join(f.web, ".env.local"))},quiet:true});\nif(!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET==='replace-with-a-random-secret'){console.error('Build inherited a stale auth secret');process.exit(41);}\nif(process.env.NEXT_TELEMETRY_DISABLED!=='1'){console.error('Build did not opt out of telemetry');process.exit(42);}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(['pnpm',...process.argv.slice(2)])+'\\n');\n`, { mode: 0o700 });
  const setup = () => probe(f.web, `import fs from 'node:fs';
const read=fs.readFileSync;fs.readFileSync=((file,...args)=>String(file)==='/etc/os-release'?'ID=ubuntu\\n':Reflect.apply(read,fs,[file,...args])) as typeof fs.readFileSync;
import { main } from './ops/setup-host';
Promise.resolve().then(()=>main(["--systemd"])).then(code=>{process.exitCode=code??0}).catch(error=>{console.error(error);process.exitCode=1});`, f.root, { ...f.env, UNIT_DIR: units, WEB: f.web, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
  const result = await setup();
  assert.equal(result.status, 0, result.stderr);
  const env = parse(await fs.readFile(path.join(f.web, ".env.local")));
  assert.ok(env.BETTER_AUTH_SECRET.length >= 40);
  assert.notEqual(env.BETTER_AUTH_SECRET, "replace-with-a-random-secret");
  assert.ok(!(result.stdout + result.stderr).includes(env.BETTER_AUTH_SECRET));
  assert.equal((await fs.stat(path.join(f.web, ".env.local"))).mode & 0o777, 0o600);
  assert.equal(env.NEXT_PUBLIC_APP_URL, "http://localhost:38173");
  assert.equal(env.TRUSTED_ORIGINS, "http://localhost:38173");
  assert.equal(env.PORT, "38173");
  for (const [name, usb, lane] of [["scps-reader.service", "USB0", "reader-1"], ["scps-reader2.service", "USB1", "reader-2"]]) {
    const unit = await fs.readFile(path.join(units, name), "utf8");
    const verification = spawnSync("systemd-analyze", ["verify", path.join(units, name)], { encoding: "utf8" });
    if (verification.error?.message.includes("ENOENT")) t.diagnostic("systemd-analyze unavailable; unit verification skipped");
    else assert.equal(verification.status, 0, verification.stderr);
    assert.doesNotMatch(verification.stderr, /EnvironmentFile=.*(?:not absolute|ignoring)/i);
    assert.ok(unit.includes(`tools/ops/reset-usb-nfc.ts ${usb}`));
    assert.ok(unit.includes(`POS_LANE_ID=${lane}`));
    assert.match(unit, /TimeoutStopSec=10/);
    assert.doesNotMatch(unit, /YOUR_USERNAME|__REPO_ROOT__|\.py|\.venv/);
    if (usb === "USB1") assert.match(unit, /ExecStartPre=\/bin\/sleep 5/);
  }
  const webVerification = spawnSync("systemd-analyze", ["verify", path.join(units, "scps.service")], { encoding: "utf8" });
  if (!webVerification.error?.message.includes("ENOENT")) assert.equal(webVerification.status, 0, webVerification.stderr);
  const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.ok(calls.some(args => args.join(" ") === "systemctl restart scps.service"));
  assert.ok(!calls.some(args => args[0] === "systemctl" && args.some(arg => arg.startsWith("scps-reader"))));

  const webUnit = path.join(units, "scps.service");
  const customized = (await fs.readFile(webUnit, "utf8")).replace("RestartSec=5", "RestartSec=17");
  await fs.writeFile(webUnit, customized);
  const reader = path.join(units, "scps-reader.service");
  const existingReader = await fs.readFile(reader, "utf8");
  const missingReader = path.join(units, "scps-reader2.service");
  const expectedReader = await fs.readFile(missingReader, "utf8");
  await fs.unlink(missingReader);

  const rerun = await setup();
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(await fs.readFile(webUnit, "utf8"), customized);
  assert.equal(await fs.readFile(reader, "utf8"), existingReader);
  assert.equal(await fs.readFile(missingReader, "utf8"), expectedReader);

  await fs.writeFile(log, "");
  const fullyInstalled = await setup();
  assert.equal(fullyInstalled.status, 0, fullyInstalled.stderr);
  const rerunCalls = await fs.readFile(log, "utf8");
  assert.doesNotMatch(rerunCalls, /"tee"|"daemon-reload"/);
  assert.match(rerunCalls, /\["systemctl","restart","scps\.service"\]/);
});

test("cutover retires owned legacy units before restart and refuses unsafe transitions", async t => {
  for (const mode of ["owned", "override", "stop-failure", "invalid-unit", "repeat"]) {
    const f = await fixture(t);
    const log = path.join(f.root, "cutover-log");
    await fs.writeFile(path.join(f.binaries, "pnpm"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await fs.writeFile(path.join(f.binaries, "sudo"), `#!/bin/sh\necho "$*" >> "$LOG"\nif [ "$1" = -u ]; then shift 2; exec "$@"; fi\nif [ "$1" = tee ]; then cat >/dev/null; exit 0; fi\nif [ "$MODE" = stop-failure ] && [ "$2" = stop ]; then exit 9; fi\nexit 0\n`, { mode: 0o700 });
    await fs.writeFile(path.join(f.binaries, "systemctl"), `#!/bin/sh\ncase "$*" in\n*Version*) echo 255;;\n*LoadState*) case "$*" in *stuco-web.service*) echo loaded;; *scps-reader.service*) [ "$MODE" = repeat ] && echo loaded || echo not-found;; *) echo not-found;; esac;;\n*FragmentPath*) echo /etc/systemd/system/example.service;;\n*WorkingDirectory*) printf '%s\\n' "$WEB";;\n*DropInPaths*) [ "$MODE" = override ] && echo /etc/systemd/system/example.service.d/custom.conf || true;;\n*ActiveState*) echo inactive;;\nesac\n`, { mode: 0o700 });
    await fs.writeFile(path.join(f.binaries, "systemd-analyze"), `#!/bin/sh\n[ "$1" = --version ] && exit 0\n[ "$MODE" = invalid-unit ] && exit 1\nexit 0\n`, { mode: 0o700 });
    const result = await probe(f.web, `import fs from 'node:fs'; const read=fs.readFileSync; fs.readFileSync=((file,...args)=>String(file)==='/etc/os-release'?'ID=ubuntu\\n':Reflect.apply(read,fs,[file,...args])) as typeof fs.readFileSync; import { main } from './ops/setup-host'; main(['--systemd']);`, f.root, { ...f.env, MODE: mode, LOG: log, WEB: f.web, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
    const calls = await fs.readFile(log, "utf8").catch(() => "");
    if (mode === "owned" || mode === "repeat") {
      assert.equal(result.status, 0, result.stderr);
      assert.ok(calls.indexOf("systemctl stop stuco-web.service") < calls.indexOf("tee /etc/systemd/system/scps.service"));
      assert.ok(calls.indexOf("systemctl disable stuco-web.service") < calls.indexOf("systemctl restart scps.service"));
      assert.doesNotMatch(calls, /systemctl (stop|disable|start|restart) scps-reader/);
    } else {
      assert.notEqual(result.status, 0, mode);
      assert.doesNotMatch(calls, /tee |systemctl restart/);
      if (mode === "override" || mode === "invalid-unit") assert.doesNotMatch(calls, /systemctl stop/);
    }
  }
});

test("public HTTPS setup configures the browser origin and keeps the app behind Caddy", async t => {
  const f = await fixture(t);
  const commands = path.join(f.root, "https-commands");
  const proxy = path.join(f.root, "Caddyfile");
  const override = path.join(f.root, "https.conf");
  for (const [name, body] of Object.entries({
    systemctl: `case "$*" in
  *Version*) echo 255;;
  *LoadState*) if [ -f "$OVERRIDE" ] && [ "$4" = scps.service ]; then echo loaded; else echo not-found; fi;;
  *FragmentPath*) echo /etc/systemd/system/scps.service;;
  *DropInPaths*) echo /etc/systemd/system/scps.service.d/90-scps-https.conf;;
  *WorkingDirectory*) printf '%s\\n' "$WEB";;
esac`,
    "systemd-analyze": "exit 0",
    pnpm: `printf '%s\\n' "$NEXT_PUBLIC_APP_URL" > "$BUILD_ORIGIN"`,
    caddy: `if [ "$1" = version ]; then echo v2.11.4; else grep -q reverse_proxy; fi`,
    "dpkg-query": `printf ' /etc/caddy/Caddyfile %s\\n' "$(printf '%s' 'factory config' | md5sum | cut -d ' ' -f 1)"`,
    curl: `printf '%s\\n' "$*" >> "$LOG"; printf '%s' "$HTTPS_STATUS"`,
    sudo: `printf '%s\\n' "$*" >> "$LOG"
case "$1" in
  -u) shift 2; exec "$@";;
  cat) if [ -f "$PROXY" ]; then cat "$PROXY"; else printf '%s' 'factory config'; fi;;
  install) for dest do :; done; case "$dest" in
    /etc/caddy/Caddyfile) cat > "$PROXY";;
    */scps.service.d/90-scps-https.conf) cat > "$OVERRIDE";;
    *) exit 5;;
  esac;;
  tee) cat >/dev/null;;
  systemctl) ;;
  *) exit 6;;
esac`,
  })) await fs.writeFile(path.join(f.binaries, name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  const env = { ...f.env, PATH: `${f.binaries}:${f.env.PATH ?? ""}`, LOG: commands, PROXY: proxy, OVERRIDE: override, WEB: f.web, BUILD_ORIGIN: path.join(f.root, "build-origin") };
  const setup = (host: string, status = "200") => probe(f.web, `import fs from 'node:fs';
const dropIn = '/etc/systemd/system/scps.service.d/90-scps-https.conf';
const read = fs.readFileSync;
const exists = fs.existsSync;
fs.readFileSync = ((file, ...args) => String(file) === '/etc/os-release' ? 'ID=ubuntu\\n' : Reflect.apply(read, fs, [String(file) === dropIn ? process.env.OVERRIDE : file, ...args])) as typeof fs.readFileSync;
fs.existsSync = file => exists(String(file) === dropIn ? process.env.OVERRIDE! : file);
import { main } from './ops/setup-host';
main(['--https', ${JSON.stringify(host)}]);`, f.root, { ...env, HTTPS_STATUS: status });
  const invalid = await setup("127.0.0.1");
  assert.notEqual(invalid.status, 0);
  await assert.rejects(fs.stat(commands), { code: "ENOENT" });
  const ip = await setup("93.184.216.34");
  assert.equal(ip.status, 0, ip.stderr);
  assert.match(await fs.readFile(proxy, "utf8"), /^93\.184\.216\.34 \{[\s\S]*profile shortlived[\s\S]*reverse_proxy 127\.0\.0\.1:38173/m);
  assert.match(await fs.readFile(proxy, "utf8"), /default_sni 93\.184\.216\.34/);
  assert.match(await fs.readFile(override, "utf8"), /Environment="HOSTNAME=127\.0\.0\.1"/);
  const values = parse(await fs.readFile(path.join(f.web, ".env.local")));
  assert.equal(values.NEXT_PUBLIC_APP_URL, "https://93.184.216.34");
  assert.equal(values.TRUSTED_ORIGINS, "https://93.184.216.34");
  assert.equal(values.TRUST_PROXY, "true");
  assert.equal((await fs.readFile(env.BUILD_ORIGIN, "utf8")).trim(), "https://93.184.216.34");
  const log = await fs.readFile(commands, "utf8");
  assert.match(log, /systemctl restart scps\.service[\s\S]*systemctl reload-or-restart caddy\.service[\s\S]*https:\/\/93\.184\.216\.34\/login/);
  await fs.writeFile(commands, "");
  const rerun = await setup("93.184.216.34");
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.doesNotMatch(await fs.readFile(commands, "utf8"), /^install /m);
  await fs.writeFile(proxy, "custom proxy");
  const refused = await setup("payments.school.org");
  assert.notEqual(refused.status, 0);
  assert.equal(await fs.readFile(proxy, "utf8"), "custom proxy");
  assert.equal(parse(await fs.readFile(path.join(f.web, ".env.local"))).NEXT_PUBLIC_APP_URL, "https://93.184.216.34");
  await fs.writeFile(proxy, "factory config");
  await fs.unlink(override);
  const domain = await setup("payments.school.org");
  assert.equal(domain.status, 0, domain.stderr);
  const domainConfig = await fs.readFile(proxy, "utf8");
  assert.match(domainConfig, /^payments\.school\.org \{/m);
  assert.doesNotMatch(domainConfig, /profile shortlived/);
  assert.equal(parse(await fs.readFile(path.join(f.web, ".env.local"))).NEXT_PUBLIC_APP_URL, "https://payments.school.org");
  const unready = await setup("payments.school.org", "502");
  assert.notEqual(unready.status, 0);
  assert.match(unready.stderr, /HTTPS is not ready/);
});

test("setup without systemd builds without installing or restarting services", async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.binaries, "sudo"), `#!/bin/sh\n[ "$1" = "-u" ] || exit 77\nshift 2\nexec "$@"\n`, { mode: 0o700 });
  await fs.writeFile(path.join(f.binaries, "pnpm"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const result = await probe(f.web, `import fs from 'node:fs';
const read=fs.readFileSync;fs.readFileSync=((file,...args)=>String(file)==='/etc/os-release'?'ID=ubuntu\\n':Reflect.apply(read,fs,[file,...args])) as typeof fs.readFileSync;
import { main } from './ops/setup-host';
process.exitCode=main(["--no-systemd"]);`, f.root, { ...f.env, PATH: `${f.binaries}:${f.env.PATH ?? ""}` });
  assert.equal(result.status, 0, result.stderr);
  const env = parse(await fs.readFile(path.join(f.web, ".env.local")));
  assert.equal(env.PORT, "38173");
  assert.equal(env.NEXT_PUBLIC_APP_URL, "http://localhost:38173");
});
