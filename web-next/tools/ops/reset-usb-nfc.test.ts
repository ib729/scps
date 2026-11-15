import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resetUsbNfc } from "./reset-usb-nfc";

test("USB1 reset follows its actual sysfs USB ancestor and rebinds after cancellation", { timeout: 10000 }, async t => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "selected USB reset "));
  const usb = path.join(directory, "devices", "usb2", "2-1.4");
  const leaf = path.join(usb, "2-1.4:1.0", "ttyUSB1");
  const log = path.join(directory, "commands");
  const previousPath = process.env.PATH;
  try {
    await fsp.mkdir(leaf, { recursive: true });
    await fsp.writeFile(path.join(usb, "idVendor"), "1a86\n");
    await fsp.writeFile(path.join(usb, "idProduct"), "7523\n");
    await fsp.writeFile(log, "");
    await fsp.writeFile(path.join(directory, "sudo"), `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args:process.argv.slice(2),input:fs.readFileSync(0,'utf8')})+'\\n');\n`, { mode: 0o700 });
    process.env.PATH = directory;
    const realpath = fsp.realpath;
    t.mock.method(fsp, "realpath", async (file: fs.PathLike) => String(file) === "/sys/class/tty/ttyUSB1/device" ? leaf : String(file) === "/sys/bus/usb/devices/2-1.4" ? usb : realpath(file));
    const commands = () => fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { args: string[]; input: string });
    const waitFor = async (count: number) => {
      const watcher = fs.watch(log);
      try { while (commands().length < count) await once(watcher, "change"); }
      finally { watcher.close(); }
    };
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const stopped = new AbortController();
    const unbound = waitFor(1);
    const pending = assert.rejects(resetUsbNfc("USB1", stopped.signal), { name: "AbortError" });
    await unbound;
    stopped.abort();
    await pending;
    assert.deepEqual(commands(), [
      { args: ["tee", "/sys/bus/usb/drivers/usb/unbind"], input: "2-1.4\n" },
      { args: ["tee", "/sys/bus/usb/drivers/usb/bind"], input: "2-1.4\n" },
    ]);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("invalid selectors and non-USB serial devices cannot trigger a reset", async t => {
  const realpath = fsp.realpath;
  t.mock.method(fsp, "realpath", async (file: fs.PathLike) => String(file).startsWith("/sys/class/tty/") ? "/sys/devices/virtual/tty/ttyUSB0" : realpath(file));
  await assert.rejects(resetUsbNfc("USB0;reboot"), /invalid|unsupported|unknown/i);
  await assert.rejects(resetUsbNfc("USB0"), /USB.*ancestor|USB.*device|USB.*parent/i);
});
