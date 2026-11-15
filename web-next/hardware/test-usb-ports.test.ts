import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./test-usb-ports.ts', import.meta.url));

function run(args: string[], input: string, path: string): Promise<{ code: number | null; output: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; output: string }>();
  const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
    env: { ...process.env, PATH: path },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
  child.once('error', reject);
  child.once('close', (code) => resolve({ code, output }));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  return promise;
}

test('help and piped EOF/quit finish without running hardware observations', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usb ports '));
  try {
    for (const command of ['lsusb', 'dmesg', 'nfc-list', 'nfc-scan-device']) {
      await writeFile(join(directory, command), '#!/bin/sh\necho UNEXPECTED_HARDWARE >&2\nexit 99\n', { mode: 0o700 });
    }
    for (const [args, input] of [[['--help'], ''], [[], ''], [[], 'quit\n'], [[], 'bottom USB 2.0\nquit\n']] as [string[], string][]) {
      const result = await run(args, input, directory);
      assert.equal(result.code, 0, result.output);
      assert.doesNotMatch(result.output, /UNEXPECTED_HARDWARE/);
      if (args.length === 0) assert.doesNotMatch(result.output, /: WORKING/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('USB detection and a TTY do not classify a failed NFC probe as working', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usb failed reader '));
  try {
    const commands: Record<string, string> = {
      ls: "printf 'ttyUSB0\\n'",
      lsusb: "if [ \"$1\" = '-t' ]; then printf 'Driver=ch341\\n'; else printf 'Bus 001 Device 002: ID 1a86:7523 CH340 serial converter\\n'; fi",
      dmesg: "printf 'usb 1-1: ch341 converter now attached to ttyUSB0\\n'",
      'nfc-list': "echo 'Unable to open NFC device' >&2; exit 1",
      'nfc-scan-device': "echo 'Unable to open NFC device' >&2; exit 1",
    };
    for (const [command, body] of Object.entries(commands)) {
      await writeFile(join(directory, command), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
    }
    const result = await run([], 'bottom USB 2.0\n\nn\n', directory);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /bottom USB 2\.0: BROKEN \(NFC fails\)/);
    assert.match(result.output, /No working ports found/);
    assert.doesNotMatch(result.output, /: WORKING|is WORKING/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
