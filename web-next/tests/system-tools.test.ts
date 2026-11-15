import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startTestServer, type TestServer } from "./helpers/server";
import { extractBackup } from "../tools/sqlite-snapshot";
import Database from "better-sqlite3";

test("administrator backup and reader restart use typed tools while preserving role and failure gates", { timeout: 180000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "system typed tools "));
  const log = path.join(directory, "commands");
  const started = path.join(directory, "started");
  const failedModule = path.join(directory, "fail-module");
  await fs.writeFile(log, "");
  const body = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const name=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({name,args})+'\\n');
if(name==='sudo'){
 if(!['systemctl','lsof','modprobe'].includes(args[0]))throw new Error('Unexpected privilege escalation');
 const result=cp.spawnSync(path.join(${JSON.stringify(directory)},args[0]),args.slice(1),{stdio:'inherit'});
 if(result.signal)process.kill(process.pid,result.signal);else process.exit(result.status??1);
}
if(name==='ls')console.log('ttyUSB0');
if(name==='udevadm')console.log('ID_VENDOR_ID=1a86');
if(name==='lsof')process.exit(1);
if(name==='systemctl'){
 if(args[0]==='show')console.log(args.includes('LoadState')?(args.includes('tap-broadcaster-reader2.service')?'not-found':'loaded'):fs.existsSync(${JSON.stringify(started)})?'active':'inactive');
 if(args[0]==='start')fs.writeFileSync(${JSON.stringify(started)},'active');
 if(args[0]==='stop')fs.rmSync(${JSON.stringify(started)},{force:true});
}
if(name==='modprobe'&&args.includes('-r')&&fs.existsSync(${JSON.stringify(failedModule)}))process.exit(23);
if(name==='nfc-list')console.log('NFC device: PN532 opened\\n0 ISO14443A passive target(s) found.');
`;
  for (const name of ["sudo", "ls", "udevadm", "lsof", "systemctl", "modprobe", "nfc-list"]) await fs.writeFile(path.join(directory, name), body, { mode: 0o700 });
  const keys = ["PATH", "WEB_BACKUP_SCRIPT", "FIX_READERS_SCRIPT_PATH", "ZSTD_CLEVEL", "ZSTD_NBTHREADS"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  process.env.PATH = `${directory}:${process.env.PATH ?? ""}`;
  process.env.WEB_BACKUP_SCRIPT = "";
  process.env.FIX_READERS_SCRIPT_PATH = "";
  process.env.ZSTD_CLEVEL = "15";
  process.env.ZSTD_NBTHREADS = "0";
  let server: TestServer | undefined;
  try {
    try { server = await startTestServer(); }
    finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    const baseURL = server.baseURL;
    const login = async (role: string) => {
      const response = await fetch(`${baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL }, body: JSON.stringify({ email: `${role}@example.test`, password: "scps-test-password-123" }) });
      assert.equal(response.status, 200);
      return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    };
    const request = (endpoint: string, cookie: string, method = "GET", origin = baseURL) => fetch(baseURL + endpoint, { method, headers: { Cookie: cookie, Origin: origin }, signal: AbortSignal.timeout(30000) });
    for (const role of ["staff", "customer"]) {
      const cookie = await login(role);
      assert.equal((await request("/api/backup/download", cookie)).status, 403);
      assert.equal((await request("/api/system/restart-services", cookie, "POST")).status, 403);
    }
    const admin = await login("admin");
    assert.equal((await request("/api/system/restart-services", admin, "POST", "https://untrusted.invalid")).status, 403);
    assert.equal(await fs.readFile(log, "utf8"), "");
    const download = await request("/api/backup/download", admin);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("Content-Type"), "application/zstd");
    const archive = path.join(directory, "download.tar.zst");
    await fs.writeFile(archive, Buffer.from(await download.arrayBuffer()));
    const staging = path.join(directory, "extract");
    await fs.mkdir(staging);
    const snapshot = new Database(await extractBackup(archive, staging), { readonly: true });
    try { assert.equal(snapshot.prepare("SELECT balance FROM accounts WHERE customer_id=2").pluck().get(), 1000); }
    finally { snapshot.close(); }
    const restarted = await request("/api/system/restart-services", admin, "POST");
    assert.equal(restarted.status, 200);
    assert.equal((await restarted.json()).success, true);
    const calls = () => fs.readFile(log, "utf8").then(text => text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { name: string; args: string[] }));
    const startsBefore = (await calls()).filter(call => call.name === "systemctl" && call.args[0] === "start").length;
    await fs.writeFile(failedModule, "fail");
    const failedRestart = await request("/api/system/restart-services", admin, "POST");
    assert.equal(failedRestart.status, 500);
    assert.equal((await failedRestart.json()).success, false);
    assert.equal((await calls()).filter(call => call.name === "systemctl" && call.args[0] === "start").length, startsBefore);
    await fs.writeFile(path.join(directory, "zstd"), `#!${process.execPath}\nprocess.exit(29);\n`, { mode: 0o700 });
    assert.equal((await request("/api/backup/download", admin)).status, 500);
    assert.equal(server.database.prepare("SELECT balance FROM accounts WHERE customer_id=2").pluck().get(), 1000);
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await server?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
