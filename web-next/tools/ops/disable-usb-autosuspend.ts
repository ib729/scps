import { constants, existsSync, realpathSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { exitFailure } from "./check_usb_port";
import { command } from "./recover-nfc";

export async function configureAutosuspend(filename: string): Promise<string> {
  const original = await readFile(filename, "utf8");
  if (!original.trim() || /[\r\n]/.test(original.trim())) throw new Error("Expected a nonempty, single-line kernel cmdline; refusing to alter boot configuration");
  const backup = `${filename}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  await copyFile(filename, backup, constants.COPYFILE_EXCL);
  console.log(`Boot configuration backup: ${backup}`);
  const tokens = original.trim().split(/\s+/);
  if (tokens.filter(token => token.startsWith("usbcore.autosuspend=")).length === 1 && tokens.includes("usbcore.autosuspend=-1")) return backup;
  const updated = [...tokens.filter(token => !token.startsWith("usbcore.autosuspend=")), "usbcore.autosuspend=-1"].join(" ") + "\n";
  try {
    // Write in place to preserve the boot file's ownership and permissions.
    await writeFile(filename, updated);
    if (await readFile(filename, "utf8") !== updated) throw new Error("Boot configuration verification failed");
  } catch (error) {
    try { await writeFile(filename, original); }
    catch (restoreError) { throw new AggregateError([error, restoreError], `Boot edit and rollback failed; restore ${backup} manually`); }
    throw error;
  }
  return backup;
}

export async function confirmReboot(input: Readable = process.stdin, output: Writable = process.stdout): Promise<boolean> {
  const readline = createInterface({ input });
  const lines = readline[Symbol.asyncIterator]();
  try {
    output.write("Reboot now? (y/N) ");
    const answer = await lines.next();
    return !answer.done && /^y$/i.test(answer.value.trim());
  } finally { readline.close(); }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: sudo node --import tsx tools/ops/disable-usb-autosuspend.ts\nBack up /boot/firmware/cmdline.txt, set usbcore.autosuspend=-1, and ask explicitly before rebooting.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  if (process.getuid?.() !== 0) throw new Error("Run this tool with sudo to edit the kernel boot configuration");
  await configureAutosuspend("/boot/firmware/cmdline.txt");
  const active = (await readFile("/sys/module/usbcore/parameters/autosuspend", "utf8")).trim();
  if (active === "-1") {
    console.log("USB autosuspend is already disabled; no reboot required.");
    return;
  }
  console.log(`USB autosuspend currently ${active}; reboot required to apply the boot parameter. After reboot verify /sys/module/usbcore/parameters/autosuspend is -1.`);
  if (await confirmReboot()) {
    console.log("Rebooting in 5 seconds (Ctrl+C to cancel)...");
    await delay(5000);
    await command("reboot", []);
  } else console.log("Reboot skipped. Run sudo reboot when ready.");
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
