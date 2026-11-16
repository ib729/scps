import { existsSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { listSerialPorts, probeReader, runObservation } from "../../hardware/diagnose-nfc";
import { assertReaderReleased, exitFailure, observeUsbPort } from "./check_usb_port";
import { stopReaders } from "./recover-nfc";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/test-reader2-hardware.ts\nObserve Reader 2 (/dev/ttyUSB1), stop both broadcaster owners, check exclusive ownership and perform a bounded native PN532 scan. Leaves services stopped for further diagnosis.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  console.log("Reader 2 Hardware Diagnostic\nUART PN532: verify SW1=OFF/SW2=ON for the documented module, crossed TX/RX, common GND and correct supply voltage. Swap adapters/modules to isolate wiring, power and PN532 faults.");
  await observeUsbPort();
  if (!(await listSerialPorts()).includes("/dev/ttyUSB1")) throw new Error("Reader 2 /dev/ttyUSB1 is absent; inspect its actual USB topology, power and ch341 driver");
  const ancestry = await runObservation("udevadm", ["info", "--query=path", "--name=/dev/ttyUSB1"]);
  console.log(`Selected Reader 2 sysfs ancestry:\n${ancestry.output}`);
  await stopReaders(["/dev/ttyUSB1"]);
  await delay(2000);
  assertReaderReleased("/dev/ttyUSB1");
  // libnfc owns the real 115200-baud PN532 calibration; stty must not race it.
  const serial = await runObservation("stty", ["-F", "/dev/ttyUSB1", "-a"]);
  console.log(`Serial configuration observation:\n${serial.output}`);
  const result = await probeReader("pn532_uart:/dev/ttyUSB1");
  if (!result.ok) throw new Error(`Reader 2 PN532 communication failed: ${result.error}. Check UART mode, TX/RX wiring, loose connections, power and PN532 module; a TTY alone is not reader health.`);
  console.log("Reader 2 native PN532 communication verified. Restart with: sudo systemctl start scps-reader.service scps-reader2.service; then verify a real tap on each.");
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
