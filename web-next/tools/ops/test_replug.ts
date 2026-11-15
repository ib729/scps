import { existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { probeReader, runObservation } from "../../hardware/diagnose-nfc";
import { assertReaderReleased, exitFailure, observeUsbPort, serialSelection } from "./check_usb_port";
import { readerServices } from "./recover-nfc";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/test_replug.ts [USB0|USB1|/dev/ttyUSBn]\nCompare the same selected TTY before unplug, after unplug and after replug. Default USB0. Stop both broadcaster services first; native communication, not adapter presence, determines health.");
    return;
  }
  if (args.length > 1) throw new Error("Expected at most one USB serial selector");
  const [selected] = await serialSelection(args[0] ?? "USB0");
  const readline = createInterface({ input: process.stdin });
  const lines = readline[Symbol.asyncIterator]();
  const prompt = async (message: string) => {
    process.stdout.write(message);
    if ((await lines.next()).done) throw new Error("Input ended; unplug/replug comparison was not completed");
  };
  try {
    await prompt(`Press ENTER with ${selected} plugged in and ready...`);
    console.log("\nInitial state:");
    const initial = await observeUsbPort();
    if (!initial.ports.includes(selected)) throw new Error(`${selected} is absent before unplug; select the actual reader TTY`);
    await prompt("UNPLUG this reader; press ENTER after unplugging...");
    await delay(1000);
    console.log("\nAfter unplug:");
    const unplugged = await observeUsbPort();
    const removed = !unplugged.ports.includes(selected);
    console.log(removed ? `${selected} was removed.` : `${selected} remains present; unplug transition is unverified (wrong reader or stale device).`);
    await prompt("PLUG the same reader into the SAME physical port; press ENTER...");
    await delay(3000);
    console.log("\nAfter replug:");
    const replugged = await observeUsbPort();
    console.log(`Comparison: initial ports=${initial.ports.join(", ")}; unplugged=${unplugged.ports.join(", ")}; replugged=${replugged.ports.join(", ")}`);
    if (!removed || !replugged.ports.includes(selected)) throw new Error("Unplug/replug transition not verified. Check the selected port, USB power, cable and ch341 driver; compare another physical port.");
    for (const service of readerServices) {
      const state = await runObservation("systemctl", ["show", service, "-p", "ActiveState", "--value"]);
      if (!state.ok || !/^(inactive|failed)$/.test(state.output.trim())) throw new Error(`Stop ${service} before the exclusive native reader probe (state ${state.output})`);
    }
    assertReaderReleased(selected);
    const probe = await probeReader(`pn532_uart:${selected}`);
    if (!probe.ok) throw new Error(`TTY returned but NFC communication failed: ${probe.error}`);
    console.log("Selected reader unplug/replug and native NFC communication verified. Services were not changed; restart them and test a real tap.");
  } finally { readline.close(); }
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
