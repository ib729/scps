import { existsSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { setTimeout as settle } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { probeReader } from './diagnose-nfc';

const separator = '='.repeat(60);

async function testReader(name: string, device: string): Promise<boolean> {
  console.log(`\n${separator}\nTesting ${name} (${device})\n${separator}`);
  console.log('[1/3] Attempting to open device...');
  console.log(`[2/3] Device info: ${device}`);
  console.log('[3/3] Testing card detection (tap a card within 5 seconds)...');
  try {
    const result = await probeReader(device);
    if (!result.ok) throw new Error(result.error ?? 'Reader could not be opened');
    console.log('✓ Device opened successfully!');
    console.log(result.uid ? `✓ Card detected! UID: ${result.uid}` : 'No card detected; reader opened successfully.');
    console.log(`✓ ${name} is WORKING`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|timed out/i.test(message)) {
      console.log(`✗ ${name} FAILED: Connection timeout`);
      console.log('   This usually means:');
      console.log('   - The device is not a PN532 reader');
      console.log('   - The reader hardware is faulty');
      console.log('   - Wrong device type specified');
    } else {
      console.log(`✗ ${name} FAILED: ${message}`);
    }
    return false;
  }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node --import tsx hardware/test-readers.ts\n\nTest USB0 and USB1 sequentially, allowing up to five seconds per reader.\nStop broadcaster services first. Press Enter to begin; EOF exits.');
    return 0;
  }
  if (args.length) {
    console.error(`Unknown argument: ${args[0]}`);
    return 1;
  }
  console.log(`NFC Reader Hardware Test\n${separator}`);
  console.log('This script will test both USB readers to identify which');
  console.log('physical readers are working.\n');
  console.log('Make sure:');
  console.log('1. Both readers are plugged in');
  console.log('2. No broadcaster services are running');
  console.log('3. You have a card ready to tap\n');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write('Press Enter to start testing...');
    let confirmed = false;
    for await (const line of input) {
      void line;
      confirmed = true;
      break;
    }
    if (!confirmed) return 0;

    const usb0 = await testReader('Reader USB0', 'tty:USB0:pn532');
    await settle(1000);
    const usb1 = await testReader('Reader USB1', 'tty:USB1:pn532');

    console.log(`\n${separator}\nTEST SUMMARY\n${separator}`);
    console.log(`USB0 (ttyUSB0): ${usb0 ? '✓ WORKING' : '✗ NOT WORKING'}`);
    console.log(`USB1 (ttyUSB1): ${usb1 ? '✓ WORKING' : '✗ NOT WORKING'}\n`);
    if (usb0 && usb1) {
      console.log('✓ Both readers are working!');
      console.log('  You can use dual-reader mode.');
    } else if (usb1) {
      console.log('⚠ Only USB1 is working.');
      console.log('  Recommendation:');
      console.log('  1. Check if USB0 reader is plugged in correctly');
      console.log('  2. Try swapping the USB ports');
      console.log('  3. Replace the USB0 reader if faulty');
    } else if (usb0) {
      console.log('⚠ Only USB0 is working.');
      console.log('  You may need to swap the service configurations.');
    } else {
      console.log('✗ Neither reader is working!');
      console.log('  Check your hardware connections.');
    }
    return usb0 && usb1 ? 0 : 1;
  } finally {
    input.close();
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
