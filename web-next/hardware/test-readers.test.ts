import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./test-readers.ts', import.meta.url));

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'dual-reader-'));
  const log = path.join(directory, 'calls');
  await writeFile(path.join(directory, 'nfc-list'), `#!${process.execPath}
const fs = require('node:fs');
const device = process.env.LIBNFC_DEVICE;
fs.appendFileSync(process.env.PROBE_LOG, device + '\\n');
if (process.env.FAIL_USB1 === '1' && device === 'pn532_uart:/dev/ttyUSB1') {
  console.log('No NFC device found.');
  process.exit(1);
}
console.log('nfc-list uses libnfc 1.8.0');
console.log('NFC device: PN532 opened');
console.log('0 ISO14443A passive target(s) found.');
`, { mode: 0o755 });
  return { directory, log };
}

async function run(directory: string, log: string, args: string[], input: string, failUsb1 = false) {
  const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}`, PROBE_LOG: log, FAIL_USB1: failUsb1 ? '1' : '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15_000,
    killSignal: 'SIGKILL',
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (data: string) => { output += data; });
  child.stderr.setEncoding('utf8').on('data', (data: string) => { output += data; });
  const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; output: string }>();
  child.once('error', reject);
  child.once('close', (code) => resolve({ code, output }));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  return await promise;
}

test('a failed USB1 is not reported as both working and returns failure', async () => {
  const { directory, log } = await fixture();
  try {
    const result = await run(directory, log, [], '\n', true);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /USB0 \(ttyUSB0\): ✓ WORKING/);
    assert.match(result.output, /USB1 \(ttyUSB1\): ✗ NOT WORKING/);
    assert.match(result.output, /Only USB0 is working/);
    assert.doesNotMatch(result.output, /Both readers are working/);
    assert.equal(await readFile(log, 'utf8'), 'pn532_uart:/dev/ttyUSB0\npn532_uart:/dev/ttyUSB1\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('healthy readers with no card both count as working', async () => {
  const { directory, log } = await fixture();
  try {
    const result = await run(directory, log, [], '\n');
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Both readers are working/);
    assert.match(result.output, /No card detected/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const args of [[], ['--help']]) {
  test(`${args.length ? 'help' : 'EOF at the prompt'} exits without opening hardware`, async () => {
    const { directory, log } = await fixture();
    try {
      const result = await run(directory, log, args, '');
      assert.equal(result.code, 0, result.output);
      await assert.rejects(readFile(log), { code: 'ENOENT' });
      assert.doesNotMatch(result.output, /TEST SUMMARY/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
