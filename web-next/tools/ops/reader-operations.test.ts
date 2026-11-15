import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, chmod, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { configureAutosuspend, confirmReboot } from "./disable-usb-autosuspend";

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reader ops "));
  const log = path.join(directory, "commands");
  await writeFile(log, "");
  const executable = path.join(directory, "fake-os");
  await writeFile(executable, `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const name=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG,JSON.stringify([name,...args])+'\\n');
if(name==='sudo') {
 if(args[0]===process.execPath) { if(process.env.RESET_FAIL) process.exit(17); if(process.env.RESET_SIGNAL) process.kill(process.pid,'SIGKILL'); process.exit(0); }
 const result=require('node:child_process').spawnSync(args[0],args.slice(1),{stdio:'inherit'});
 if(result.signal) process.kill(process.pid,result.signal); else process.exit(result.status??1);
}
if(name==='systemctl') {
 if(args[0]==='show') console.log(args.includes('Restart')?'always':args.includes('LoadState')?(process.env.SINGLE_READER&&args.includes('tap-broadcaster-reader2.service')?'not-found':'loaded'):args.includes('UnitFileState')?'enabled':fs.existsSync(process.env.STARTED_FILE)?'active':process.env.SERVICE_STATE||'inactive');
 if(args[0]==='start') fs.writeFileSync(process.env.STARTED_FILE,'started');
}
if(name==='lsusb') console.log(args[0]==='-t'?'Bus 02: Port 3: Driver=ch341':'Bus 002 Device 003: ID 1a86:7523 QinHeng CH340');
if(name==='ls') {
 if(args[0]==='-1' && process.env.REPLUG) {
  const counter=process.env.STARTED_FILE+'.enumerations',n=Number(fs.existsSync(counter)?fs.readFileSync(counter,'utf8'):0)+1;
  fs.writeFileSync(counter,String(n));console.log(n===2?'ttyUSB1':'ttyUSB0\\nttyUSB1');
 } else console.log(args[0]==='-1'?'ttyUSB0\\nttyUSB1':'crw-rw---- ttyUSB0 ttyUSB1');
}
if(name==='dmesg') console.log('usb 2-3: ch341 attached to ttyUSB1');
if(name==='lsof') { if(process.env.BUSY) console.log('123'); else process.exit(1); }
if(name==='nfc-list') { if(process.env.NFC_FAIL) {console.log('No NFC device found.');process.exit(0);} console.log('NFC device: PN532 opened\\n0 ISO14443A passive target(s) found.'); }
if(name==='journalctl') console.log(process.env.JOURNAL||'[WS] Authenticated (lane: reader-1)');
if(name==='cat') console.log(args[0].includes('cmdline')?'console=tty1 usbcore.autosuspend=-1':'-1');
if(name==='udevadm') console.log(args.includes('--query=property')?(process.env.OTHER_ADAPTER&&args.includes('--name=/dev/ttyUSB1')?'ID_VENDOR_ID=067b':'ID_VENDOR_ID=1a86'):'/devices/platform/usb2/2-3/2-3:1.0/ttyUSB1');
if(name==='stty') console.log('speed 115200 baud;');
if(name==='modprobe' && process.env.MODULE_FAIL && args.includes('-r')) process.exit(23);
`);
  await chmod(executable, 0o700);
  for (const command of ["sudo", "systemctl", "lsusb", "ls", "dmesg", "lsof", "nfc-list", "journalctl", "modprobe", "reboot", "cat", "udevadm", "stty"]) await symlink(executable, path.join(directory, command));
  return { directory, log, env: { ...process.env, PATH: directory, COMMAND_LOG: log, STARTED_FILE: path.join(directory, "started") } };
}

// Real child entrypoints retain the calibration waits; mocked parent timers cannot drive them.
async function invoke(name: string, env: NodeJS.ProcessEnv, args: string[] = [], input = "") {
  const child = spawn(process.execPath, ["--import", "tsx", path.isAbsolute(name) ? name : `tools/ops/${name}.ts`, ...args], { cwd: packageDirectory, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stdin.end(input);
  const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null; output: string }>();
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal, output }));
  return promise;
}

test("recovery stops both reader owners, resets, probes, then starts", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", f.env, ["USB1"]);
    assert.equal(result.code, 0, result.output);
    const commands = (await readFile(f.log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    const stopped = commands.findIndex(command => command[0] === "systemctl" && command[1] === "stop");
    const reset = commands.findIndex(command => command[0] === "sudo" && command[1] === process.execPath);
    const probe = commands.findIndex(command => command[0] === "nfc-list");
    const started = commands.findIndex(command => command[0] === "systemctl" && command[1] === "start");
    assert.ok(stopped >= 0 && reset > stopped && probe > reset && started > probe);
    assert.deepEqual(commands[stopped], ["systemctl", "stop", "tap-broadcaster.service", "tap-broadcaster-reader2.service"]);
    assert.ok(commands[reset].includes("/dev/ttyUSB1"));
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("reset failure propagates its status without starting or reporting recovery", async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", { ...f.env, RESET_FAIL: "1" }, ["USB1"]);
    assert.equal(result.code, 17, result.output);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /"start"|nfc-list/);
    assert.doesNotMatch(result.output, /recovery complete|hardware healthy/i);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("unmanaged reader owner blocks reset and driver unload", async () => {
  const f = await fixture();
  try {
    for (const tool of ["recover-nfc", "fix-readers"]) {
      const result = await invoke(tool, { ...f.env, BUSY: "1" });
      assert.notEqual(result.code, 0, result.output);
    }
    assert.doesNotMatch(await readFile(f.log, "utf8"), /modprobe|--import|"start"/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("TTY enumeration never claims NFC health and a failed specialist probe fails", { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const observation = await invoke("check_usb_port", f.env);
    assert.equal(observation.code, 0, observation.output);
    assert.match(observation.output, /not.*(?:verified|tested)|unverified/i);
    assert.doesNotMatch(observation.output, /(?:fully working|hardware healthy)/i);
    const specialist = await invoke("test-reader2-hardware", { ...f.env, NFC_FAIL: "1" });
    assert.notEqual(specialist.code, 0, specialist.output);
    assert.match(specialist.output, /UART|TX.*RX/);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /"start"/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("authenticated service without hardware recovery evidence fails verification", { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("verify-nfc-auto-recovery", { ...f.env, SERVICE_STATE: "active" }, ["--observe-seconds", "1"]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /unverified|not observed/i);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /nfc-list|"stop"|"start"/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("autosuspend edits preserve backup and are idempotent without rebooting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "autosuspend "));
  try {
    const filename = path.join(directory, "cmdline.txt");
    await writeFile(filename, "console=serial0,115200 root=PARTUUID=abc usbcore.autosuspend=2\n", { mode: 0o640 });
    const backup = await configureAutosuspend(filename);
    assert.equal(await readFile(backup, "utf8"), "console=serial0,115200 root=PARTUUID=abc usbcore.autosuspend=2\n");
    assert.equal(await readFile(filename, "utf8"), "console=serial0,115200 root=PARTUUID=abc usbcore.autosuspend=-1\n");
    const secondBackup = await configureAutosuspend(filename);
    assert.equal(await readFile(secondBackup, "utf8"), await readFile(filename, "utf8"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("replug comparison refuses to infer hardware health from a remaining TTY", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("test_replug", { ...f.env, NFC_FAIL: "1" }, [], "\n\n\n");
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /removed|unplug|unchanged/i);
    assert.doesNotMatch(result.output, /fully working|ready for NFC/i);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("reset termination reaches the caller without restarting services", async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", { ...f.env, RESET_SIGNAL: "1" }, ["USB1"]);
    assert.equal(result.signal, "SIGKILL", result.output);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /"start"|nfc-list/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("reboot requires explicit y; blank, refusal and EOF never confirm", async () => {
  for (const [answer, expected] of [["y\n", true], ["Y\n", true], ["n\n", false], ["\n", false], ["yes\n", false], ["", false]] as const) {
    const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    assert.equal(await confirmReboot(Readable.from(answer ? [answer] : []), output), expected);
  }
});

test("reader communication failure after reset leaves services stopped", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", { ...f.env, NFC_FAIL: "1" }, ["USB1"]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /communication failed/);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /"start"/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("driver-unload failure is retained after reloading and never starts readers", async () => {
  const f = await fixture();
  try {
    const result = await invoke("fix-readers", { ...f.env, MODULE_FAIL: "1" });
    assert.equal(result.code, 23, result.output);
    const commands = await readFile(f.log, "utf8");
    assert.match(commands, /"modprobe","ch341"/);
    assert.doesNotMatch(commands, /"start"|nfc-list/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("fresh error then tap establishes bounded runtime recovery evidence", { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("verify-nfc-auto-recovery", {
      ...f.env, SERVICE_STATE: "active",
      JOURNAL: "[NFC] Reader error; retrying pn532_uart:/dev/ttyUSB1 in 1s: unavailable\n[OK] Tap broadcast: AABBCCDD (lane: reader-2, reader_id: reader-2)",
    }, ["--observe-seconds", "1"]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /recovery observed/);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /nfc-list|"stop"|"start"/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("real unplug/replug transitions still require successful native communication", { timeout: 20000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("test_replug", { ...f.env, REPLUG: "1", NFC_FAIL: "1" }, [], "\n\n\n");
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /NFC communication failed/);
    assert.match(await readFile(f.log, "utf8"), /nfc-list/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("symlinked workflow help reaches its realpath main guard", async () => {
  const f = await fixture();
  try {
    const alias = path.join(f.directory, "reader help.ts");
    await symlink(path.join(packageDirectory, "tools", "ops", "check_usb_port.ts"), alias);
    const result = await invoke(alias, f.env, ["--help"]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Usage:/);
    assert.equal(await readFile(f.log, "utf8"), "");
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("driver repair reloads before exclusive native probing and starts only afterward", { timeout: 20000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("fix-readers", f.env);
    assert.equal(result.code, 0, result.output);
    const commands = (await readFile(f.log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    const stop = commands.findIndex(command => command[0] === "systemctl" && command[1] === "stop");
    const unload = commands.findIndex(command => command[0] === "modprobe" && command[1] === "-r");
    const reload = commands.findIndex(command => command[0] === "modprobe" && command[1] === "ch341");
    const probe = commands.findIndex(command => command[0] === "nfc-list");
    const start = commands.findIndex(command => command[0] === "systemctl" && command[1] === "start");
    assert.ok(stop >= 0 && unload > stop && reload > unload && probe > reload && start > probe);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("single-reader recovery skips an absent optional second-reader service", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", { ...f.env, SINGLE_READER: "1" }, ["USB0"]);
    assert.equal(result.code, 0, result.output);
    const commands = (await readFile(f.log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    assert.deepEqual(commands.find(command => command[0] === "systemctl" && command[1] === "start"), ["systemctl", "start", "tap-broadcaster.service"]);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("default recovery selects identified CH340 TTYs instead of unrelated adapters", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("recover-nfc", { ...f.env, OTHER_ADAPTER: "1" });
    assert.equal(result.code, 0, result.output);
    const commands = (await readFile(f.log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    const resets = commands.filter(command => command[0] === "sudo" && command[1] === process.execPath);
    assert.equal(resets.length, 1);
    assert.equal(resets[0].at(-1), "/dev/ttyUSB0");
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("verified unplug/replug plus a native open succeeds without mutating services", { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const result = await invoke("test_replug", { ...f.env, REPLUG: "1" }, [], "\n\n\n");
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /native NFC communication verified/);
    assert.doesNotMatch(await readFile(f.log, "utf8"), /"stop"|"start"|modprobe|reboot/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
