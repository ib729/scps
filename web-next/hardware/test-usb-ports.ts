import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { listSerialPorts, probeReader, runObservation } from './diagnose-nfc';

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node --import tsx hardware/test-usb-ports.ts\nCompare physical USB ports with read-only USB, serial, NFC and kernel observations.\nEnter a blank port label, q, quit or exit to finish.');
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const lines = readline[Symbol.asyncIterator]();
  const interrupt = () => readline.close();
  readline.on('SIGINT', interrupt);
  const prompt = async (message: string): Promise<string | null> => {
    process.stdout.write(message);
    const answer = await lines.next();
    if (answer.done) return null;
    const value = answer.value.trim();
    return /^(?:q|quit|exit)$/i.test(value) ? null : value;
  };
  const divider = '='.repeat(70);
  const results: { port: string; usbDetected: boolean; serialPort: boolean; nfcWorking: boolean; testNumber: number }[] = [];
  try {
    console.log(`${divider}\nUSB Port Test for NFC Reader\n${divider}`);
    console.log('\nInstructions:\n1. Start with reader plugged into current (working) port\n2. Press ENTER to test current state\n3. Unplug reader when prompted\n4. Plug into new port when prompted\n5. Press ENTER to test new port\n6. Repeat for each port you want to test');
    console.log(`\n${divider}`);
    let testNumber = 1;
    while (true) {
      console.log(`\nTEST #${testNumber}\n${'-'.repeat(70)}`);
      const port = await prompt("\nWhich port is the reader in? (e.g., 'bottom USB 2.0', 'top USB 3.0'): ");
      if (!port) {
        console.log('\nTesting complete!');
        break;
      }
      if (await prompt('\nPress ENTER when ready to test...') === null) break;

      console.log('\nChecking USB detection...');
      const usb = await runObservation('lsusb', []);
      const devices = usb.output.split('\n').filter((line) => /CH340/i.test(line)).join('\n');
      const usbDetected = usb.ok && Boolean(devices);
      console.log(usbDetected ? `  CH340 detected: ${devices}` : '  CH340 NOT detected in lsusb');
      if (!usb.ok) console.log(`  USB observation failed: ${usb.output}`);

      console.log('\nChecking USB topology...');
      const topology = await runObservation('lsusb', ['-t']);
      console.log(topology.output ? `  ${topology.output}` : '  Not in USB device tree');
      if (!topology.ok) console.log('  USB topology observation failed');

      console.log('\nChecking serial ports...');
      const ports = await listSerialPorts();
      let nfcWorking = false;
      if (ports.length) {
        console.log(`  Serial ports found:\n${ports.join('\n')}`);
        let selected = ports[0]!;
        if (ports.length > 1) {
          console.log(ports.map((device, index) => `  ${index + 1}. ${device}`).join('\n'));
          let choice: string | null;
          do {
            choice = await prompt('Select the reader TTY (number or full device path): ');
            if (choice === null) break;
            const match = ports.find((device, index) => device === choice || String(index + 1) === choice);
            if (match) {
              selected = match;
              break;
            }
            console.log('Select one of the listed serial ports.');
          } while (true);
          if (choice === null) break;
        }
        console.log(`\nTesting NFC connection on ${selected}...`);
        const probe = await probeReader(selected);
        nfcWorking = probe.ok;
        console.log(probe.ok ? `  NFC reader connected successfully!\n  Device: ${selected}${probe.uid ? `; UID: ${probe.uid}` : '; no card present'}` : `  Failed to connect: ${probe.error ?? 'Reader probe failed'}`);
      } else {
        console.log('  No /dev/ttyUSB* or /dev/ttyACM* devices found');
      }

      console.log('\nChecking kernel messages...');
      const kernel = await runObservation('dmesg', []);
      const messages = kernel.output.split('\n').slice(-20).filter((line) => /usb|ch340|ch341/i.test(line)).join('\n');
      if (messages) console.log(`  Recent USB messages:\n${messages}`);
      if (!kernel.ok) console.log(`  Kernel observation failed: ${kernel.output}`);

      const result = { port, usbDetected, serialPort: ports.length > 0, nfcWorking, testNumber };
      results.push(result);
      console.log(`\n${divider}\nRESULT SUMMARY\n${divider}`);
      if (result.usbDetected && result.serialPort && result.nfcWorking) {
        console.log(`Port '${port}' is WORKING`);
      } else {
        console.log(`Port '${port}' has ISSUES:`);
        if (!result.usbDetected) console.log('   - CH340 not detected in lsusb (hardware detection failure)');
        if (!result.serialPort) console.log('   - No serial port created (driver/power issue)');
        if (!result.nfcWorking) console.log('   - NFC reader cannot connect (communication failure)');
      }
      console.log(`\n${divider}`);
      if ((await prompt('\nTest another port? (y/n): '))?.toLowerCase() !== 'y') break;
      console.log('\nPlease UNPLUG the reader and move it to a different port');
      if (await prompt("Press ENTER when you've moved the reader...") === null) break;
      await delay(2000);
      testNumber++;
    }

    console.log(`\n${divider}\nFINAL RESULTS SUMMARY\n${divider}`);
    const working: string[] = [];
    const broken: string[] = [];
    for (const result of results) {
      if (result.usbDetected && result.serialPort && result.nfcWorking) {
        working.push(result.port);
        console.log(`${result.port}: WORKING`);
      } else {
        broken.push(result.port);
        const status: string[] = [];
        if (!result.usbDetected) status.push('no USB detection');
        if (!result.serialPort) status.push('no serial port');
        if (!result.nfcWorking) status.push('NFC fails');
        console.log(`${result.port}: BROKEN (${status.join(', ')})`);
      }
    }
    console.log(`\n${divider}\nRECOMMENDATIONS\n${divider}`);
    if (working.length >= 2) {
      console.log(`\nYou have ${working.length} working ports!\n   For dual-reader setup:\n   - Reader 1: ${working[0]}\n   - Reader 2: ${working[1]}`);
    } else if (working.length === 1) {
      console.log(`\nOnly 1 working port: ${working[0]}\n   For dual-reader setup, you'll need a powered USB hub:\n   - Connect hub to: ${working[0]}\n   - Connect both readers to the hub`);
    } else {
      console.log('\nNo working ports found!\n   Possible issues:\n   - Power supply insufficient\n   - All USB ports damaged\n   - USB cable faulty\n   - Driver issues');
    }
    if (broken.length) console.log(`\nBroken ports: ${broken.join(', ')}\n   These ports should be avoided for NFC readers.`);
    console.log(`\n${divider}`);
  } finally {
    readline.off('SIGINT', interrupt);
    readline.close();
  }
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
