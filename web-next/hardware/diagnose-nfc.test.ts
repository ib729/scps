import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { listSerialPorts, runObservation } from "./diagnose-nfc";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));

test("observations preserve literal arguments and failure status; serial inventory selects only USB/ACM", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nfc diagnostics "));
  const previousPath = process.env.PATH;
  try {
    const observer = path.join(directory, "observer");
    await fs.writeFile(observer, `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2))); process.exit(3);\n`, { mode: 0o700 });
    const argument = `';touch ${path.join(directory, "injected")};#`;
    const result = await runObservation(observer, [argument, "a b"]);
    assert.equal(result.ok, false);
    assert.deepEqual(JSON.parse(result.output.split("\n")[0]!), [argument, "a b"]);
    await assert.rejects(fs.stat(path.join(directory, "injected")), { code: "ENOENT" });
    await fs.writeFile(path.join(directory, "ls"), `#!${process.execPath}\nconsole.log('ttyUSB1\\nttyAMA0\\nttyACM0\\nttyUSB0\\nttyUSBx\\nother');\n`, { mode: 0o700 });
    process.env.PATH = directory;
    assert.deepEqual(await listSerialPorts(), ["/dev/ttyACM0", "/dev/ttyUSB0", "/dev/ttyUSB1"]);
    await fs.writeFile(path.join(directory, "ls"), `#!${process.execPath}\nconsole.error('inventory unavailable');process.exit(2);\n`, { mode: 0o700 });
    await assert.rejects(listSerialPorts(), /inventory unavailable/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("single-reader diagnostic EOF never opens a reader and exits after observations", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nfc diagnostic EOF "));
  const log = path.join(directory, "reader-opened");
  try {
    for (const command of ["lsusb", "lsmod", "dmesg", "find", "ls"]) await fs.writeFile(path.join(directory, command), `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o700 });
    for (const command of ["nfc-list", "nfc-scan-device"]) await fs.writeFile(path.join(directory, command), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)}, 'opened');process.exit(9);\n`, { mode: 0o700 });
    const child = spawn(process.execPath, ["--import", "tsx", "hardware/diagnose-nfc.ts"], { cwd: packageDirectory, env: { ...process.env, PATH: directory }, stdio: ["pipe", "pipe", "pipe"], timeout: 10_000, killSignal: "SIGKILL" });
    let output = "";
    child.stdout.on("data", data => { output += String(data); });
    child.stderr.on("data", data => { output += String(data); });
    const completion = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    child.stdin.end();
    assert.equal(await completion, 0, output);
    assert.match(output, /SUMMARY/);
    await assert.rejects(fs.stat(log), { code: "ENOENT" });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
