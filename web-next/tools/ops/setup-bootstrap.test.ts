import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(options: { distro?: string; old?: 'good' | 'bad'; candidate?: 'bad'; download?: 'fail'; nodeOld?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scps-bootstrap-'));
  const bin = join(root, 'bin');
  const log = join(root, 'calls');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'web-next'));
  mkdirSync(bin);
  writeFileSync(join(root, 'os-release'), `ID=${options.distro ?? 'debian'}\n`);
  writeFileSync(join(root, 'scripts/setup.sh'), readFileSync(resolve('../scripts/setup.sh'), 'utf8').replace('/etc/os-release', join(root, 'os-release')));
  const executable = (name: string, body: string) => { const path = join(bin, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); };
  executable('sudo', `echo "sudo $*" >> "$LOG"\nif [ "$1" = -u ]; then shift 2; fi\nif [ "$1" = -E ]; then shift; fi\n"$@"`);
  executable('apt-get', 'echo "apt $*" >> "$LOG"');
  executable('curl', options.download === 'fail' ? 'exit 1' : 'echo "curl $*" >> "$LOG"');
  executable('bash', 'echo "bash $*" >> "$LOG"');
  executable('python3', 'echo Python 3.12.0');
  executable('node', `case \"$*\" in *process.versions.node*) ${options.nodeOld ? 'exit 1' : 'exit 0'};; *install.js*) echo 'install script' >> \"$LOG\";; *--import*) echo \"typed $*\" >> \"$LOG\";; esac`);
  executable('npm', `echo \"npm $*\" >> \"$LOG\"\nwhile [ \"$1\" != --prefix ]; do shift; done\nshift\nprefix=$1\nmkdir -p \"$prefix/node_modules/.bin\" \"$prefix/node_modules/pnpm\"\nprintf '#!/bin/sh\\n${options.candidate === 'bad' ? 'exit 1' : 'if [ \"$1\" = --version ]; then echo 12.21.0; else echo \"app $*\" >> \"$LOG\"; fi'}\\n' > \"$prefix/node_modules/.bin/pnpm\"\nchmod +x \"$prefix/node_modules/.bin/pnpm\"`);
  if (options.old) {
    const old = join(root, '.local/pnpm/node_modules/.bin'); mkdirSync(old, { recursive: true });
    writeFileSync(join(old, 'pnpm'), `#!/bin/sh\n${options.old === 'good' ? 'if [ "$1" = --version ]; then echo 12.21.0; else echo "app $*" >> "$LOG"; fi' : 'exit 1'}\n`); chmodSync(join(old, 'pnpm'), 0o755);
    writeFileSync(join(root, '.local/pnpm/marker'), 'original');
  }
  const run = (...args: string[]) => {
    const result = spawnSync('/bin/sh', [join(root, 'scripts/setup.sh'), ...args], { encoding: 'utf8', input: '', env: { ...process.env, USER: userInfo().username, SUDO_USER: '', PATH: `${bin}:/usr/bin:/bin`, LOG: log } });
    return { ...result, calls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  };
  return { root, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('reuses verified launcher on Debian and Ubuntu and forwards service choice', () => {
  for (const distro of ['debian', 'ubuntu']) {
    const f = fixture({ distro, old: 'good' });
    try { const r = f.run('--systemd'); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.calls, /npm install/); assert.match(r.calls, /typed .*--systemd/); } finally { f.cleanup(); }
  }
});
test('replaces broken launcher only after staged verification', () => {
  const f = fixture({ old: 'bad' });
  try { const r = f.run(); assert.equal(r.status, 0, r.stderr); assert.match(r.calls, /--ignore-scripts/); assert.match(r.calls, /install script/); assert.match(r.calls, /app .*--frozen-lockfile/); assert.match(r.calls, /typed .*--no-systemd/); const previous = readdirSync(join(f.root, '.local')).find(name => name.startsWith('pnpm.previous.')); assert.ok(previous); assert.equal(readFileSync(join(f.root, '.local', previous, 'marker'), 'utf8'), 'original'); } finally { f.cleanup(); }
});

test('failed candidate preserves old launcher and prevents application setup', () => {
  const f = fixture({ old: 'bad', candidate: 'bad' });
  try { const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /pnpm 12\.21\.0 bootstrap failed/); assert.equal(readFileSync(join(f.root, '.local/pnpm/marker'), 'utf8'), 'original'); assert.doesNotMatch(r.calls, /app |typed /); } finally { f.cleanup(); }
});

test('failed NodeSource download never runs downloaded bash or installs node', () => {
  const f = fixture({ nodeOld: true, download: 'fail' });
  try { const r = f.run(); assert.notEqual(r.status, 0); assert.doesNotMatch(r.calls, /bash |apt install -y nodejs/); } finally { f.cleanup(); }
});

test('unsupported distro and unknown options fail before privileged calls', () => {
  for (const [options, args] of [[{ distro: 'arch' }, []], [{}, ['--bad']]] as const) {
    const f = fixture(options); try { const r = f.run(...args); assert.notEqual(r.status, 0); assert.doesNotMatch(r.calls, /sudo |apt /); } finally { f.cleanup(); }
  }
});
