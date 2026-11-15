import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { listSerialPorts, runObservation } from "../../hardware/diagnose-nfc";

export async function serialSelection(selector?: string): Promise<string[]> {
  if (selector === undefined) {
    const ports = await listSerialPorts();
    if (!ports.length) throw new Error("No USB serial readers found");
    const ch340: string[] = [];
    for (const port of ports) {
      const properties = await runObservation("udevadm", ["info", "--query=property", `--name=${port}`]);
      if (!properties.ok) throw new Error(`Cannot identify USB adapter for ${port}: ${properties.output}`);
      if (/^ID_VENDOR_ID=1a86$/im.test(properties.output)) ch340.push(port);
    }
    return ch340.length ? ch340 : ports;
  }
  const selected = /^(?:\/dev\/)?(?:tty)?(USB\d+|ACM\d+)$/.exec(selector)?.[1] ?? (/^\d+$/.test(selector) ? `USB${selector}` : undefined);
  if (!selected) throw new Error(`Invalid USB serial selector: ${selector}`);
  return [`/dev/tty${selected}`];
}

export function assertReaderReleased(tty: string): void {
  let owners: string;
  try {
    owners = execFileSync("sudo", ["lsof", "-t", "--", tty], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    // lsof uses status 1 with no output when nobody owns the selected device.
    if (error && typeof error === "object" && "status" in error && error.status === 1 && "stdout" in error && !String(error.stdout).trim() && "stderr" in error && !String(error.stderr).trim()) return;
    throw error;
  }
  throw new Error(`${tty} is still owned by PID(s): ${owners.trim() || "unknown"}; release its owners before probing or resetting`);
}

export async function observeUsbPort(): Promise<{ usb: string; topology: string; ports: string[] }> {
  const usb = await runObservation("lsusb", []);
  const topology = await runObservation("lsusb", ["-t"]);
  const ports = await listSerialPorts();
  const kernel = await runObservation("dmesg", []);
  console.log(`USB devices:\n${usb.output}\n\nUSB topology:\n${topology.output}\n\nSerial ports:\n${ports.join("\n") || "None"}`);
  if (ports.length) console.log((await runObservation("ls", ["-l", ...ports])).output);
  console.log(`Recent kernel USB/TTY events:\n${kernel.ok ? kernel.output.split("\n").filter(line => /usb|tty|ch34[01]|error/i.test(line)).slice(-20).join("\n") : kernel.output}`);
  console.log("Adapter/TTY presence is not NFC health; reader communication is unverified.");
  if (!usb.ok || !topology.ok) throw new Error("USB enumeration failed; inspect the reported command errors");
  if (/CH34[01]|QinHeng|1a86:/i.test(usb.output) && !ports.length) console.log("USB adapter without TTY: check the ch341 driver, cable, adapter and power supply.");
  if (!/CH34[01]|QinHeng|1a86:/i.test(usb.output)) console.log("No CH340 identifier found: check USB power/cabling or identify the reader's actual adapter.");
  return { usb: usb.output, topology: topology.output, ports };
}

export function exitFailure(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
  else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/check_usb_port.ts\nRead-only USB, topology, serial and kernel observations; does not open a reader.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  await observeUsbPort();
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
