import { existsSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { probeReader, runObservation } from "../../hardware/diagnose-nfc";
import { assertReaderReleased, exitFailure, observeUsbPort } from "./check_usb_port";
import { readerServices } from "./recover-nfc";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/verify-nfc-auto-recovery.ts [--observe-seconds 1..120]\nRead runtime service policy, USB/autosuspend state and a bounded fresh journal window (default 10s). During the window unplug/replug and tap each active reader. Recovery requires a hardware error followed by a successful tap, with no later reader error. Authentication/TTY existence alone is never hardware health. No service mutations.");
    return;
  }
  let seconds = 10;
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--observe-seconds" || !/^\d+$/.test(args[1])) throw new Error("Expected --observe-seconds 1..120");
    seconds = Number(args[1]);
    if (seconds < 1 || seconds > 120) throw new Error("Observation window must be 1..120 seconds");
  }
  let failed = false;
  const boot = await runObservation("cat", ["/boot/firmware/cmdline.txt"]);
  const autosuspend = await runObservation("cat", ["/sys/module/usbcore/parameters/autosuspend"]);
  if (!boot.ok || !/(?:^|\s)usbcore\.autosuspend=-1(?:\s|$)/.test(boot.output)) {
    console.log("FAIL: boot configuration does not confirm usbcore.autosuspend=-1; run disable-usb-autosuspend.ts.");
    failed = true;
  }
  if (!autosuspend.ok || autosuspend.output.trim() !== "-1") {
    console.log(`FAIL: USB autosuspend is not confirmed disabled (${autosuspend.output}); a reboot may be required.`);
    failed = true;
  }
  const hardware = await observeUsbPort();
  const active: string[] = [];
  let allOwnersStopped = true;
  for (const service of readerServices) {
    const property = (name: string) => runObservation("systemctl", ["show", service, "-p", name, "--value"]);
    const load = await property("LoadState");
    if (!load.ok || load.output.trim() !== "loaded") {
      console.log(`${service}: not installed (optional second-reader service may be absent).`);
      if (service === readerServices[0]) failed = true;
      continue;
    }
    const state = await property("ActiveState");
    const restart = await property("Restart");
    const enabled = await property("UnitFileState");
    console.log(`${service}: state=${state.output}; Restart=${restart.output}; enabled=${enabled.output}`);
    if (!restart.ok || restart.output.trim() !== "always" || !enabled.ok || !/^enabled(?:-runtime)?$/.test(enabled.output.trim())) failed = true;
    if (state.ok && state.output.trim() === "active") active.push(service);
    if (!state.ok || !/^(inactive|failed)$/.test(state.output.trim())) allOwnersStopped = false;
    if (!state.ok || state.output.trim() !== "active") failed = true;
  }
  if (allOwnersStopped) {
    console.log("Broadcaster owners are stopped; checking bounded native communication without competing for a reader.");
    for (const port of hardware.ports) {
      assertReaderReleased(port);
      const result = await probeReader(`pn532_uart:${port}`);
      console.log(`${port}: ${result.ok ? "native reader communication verified (not service recovery)" : `reader communication failed: ${result.error}`}`);
      if (!result.ok) failed = true;
    }
  }
  if (active.length) {
    const since = new Date().toISOString();
    console.log(`Observing ${seconds}s: unplug/replug and tap each active reader now. No direct probes while services own the readers.`);
    await delay(seconds * 1000);
    for (const service of active) {
      const journal = await runObservation("journalctl", ["--unit", service, "--since", since, "--no-pager", "--output", "cat"]);
      const state = await runObservation("systemctl", ["show", service, "-p", "ActiveState", "--value"]);
      const lines = journal.output.split("\n");
      const error = lines.findLastIndex(line => /\[NFC\] Reader error; retrying /.test(line));
      const tap = lines.findLastIndex(line => /\[OK\] Tap broadcast: [A-F\d]+ \(lane: .+, reader_id: .+\)/.test(line));
      if (journal.ok && state.ok && state.output.trim() === "active" && error >= 0 && tap > error) console.log(`${service}: hardware error followed by a fresh successful tap; recovery observed in this window.`);
      else {
        console.log(`${service}: recovery unverified / not observed. ${tap >= 0 ? "A tap occurred, but the complete hardware-error/recovery sequence was not observed." : "Service authentication or an existing TTY cannot establish hardware health."}`);
        failed = true;
      }
    }
  } else {
    console.log("No active broadcaster to observe; unattended recovery is unverified.");
    failed = true;
  }
  console.log("For continued diagnosis: journalctl -u scps-reader.service -u scps-reader2.service --since today; check USB power, kernel errors and real taps after removal/reconnect. Overnight stability and service-stop timing require separate physical acceptance.");
  if (failed) throw new Error("NFC recovery verification did not establish all required runtime checks");
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
