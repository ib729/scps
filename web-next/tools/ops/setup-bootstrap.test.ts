import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(options: { distro?: string; old?: 'good' | 'bad'; candidate?: 'bad'; download?: 'fail'; nodeOld?: boolean; managed?: 'existing' | 'active' | 'inactive' | 'busy' | 'foreign'; stopTimeout?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scps-bootstrap-'));
  const bin = join(root, 'bin');
  const log = join(root, 'calls');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'web-next'));
  mkdirSync(bin);
  writeFileSync(join(root, 'os-release'), `ID=${options.distro ?? 'debian'}\n`);
  const dropIn = join(root, 'release-setup.conf');
  if (options.managed && options.managed !== 'existing') writeFileSync(dropIn, '');
  const timeoutDropIn = join(root, 'restart-timeout.conf');
  writeFileSync(join(root, 'scripts/setup.sh'), readFileSync(resolve('../scripts/setup.sh'), 'utf8').replace('/etc/os-release', join(root, 'os-release')).replaceAll('/etc/systemd/system/scps.service.d/30-release-update.conf', dropIn).replaceAll('/etc/systemd/system/scps.service.d/31-release-stop-timeout.conf', timeoutDropIn));
  writeFileSync(join(root, '.gitignore'), '/bin/\n/calls\n/os-release\n/release-setup.conf\n/restart-timeout.conf\n/.local/\n/origin.git/\n/upstream/\n');
  git(root, 'init', '-b', 'main');
  git(root, 'add', '.gitignore', 'scripts/setup.sh');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'initial setup');
  git(root, 'clone', '--bare', '.', 'origin.git');
  git(root, 'remote', 'add', 'origin', './origin.git');
  git(root, 'push', '-u', 'origin', 'main');
  const executable = (name: string, body: string) => { const path = join(bin, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); };
  executable('sudo', `echo "sudo $*" >> "$LOG"\nif [ "$1" = -u ]; then shift 2; fi\nif [ "$1" = -E ]; then shift; fi\n"$@"`);
  executable('apt-get', 'echo "apt $*" >> "$LOG"');
  executable('systemctl', `case "$*" in
  *WorkingDirectory*) printf '%s\\n' ${options.managed === 'foreign' ? '"/other/checkout/web-next"' : options.managed ? '"$ROOT/web-next"' : "''"};;
  *User*) id -un;;
  *ActiveState*scps-update.service) echo ${options.managed === 'busy' ? 'activating' : 'inactive'};;
  *TimeoutStopUSec*) if grep -qs 'TimeoutStopSec=20s' "$ROOT/restart-timeout.conf"; then echo 20s; else printf '%s\\n' '${options.stopTimeout ?? '20s'}'; fi;;
  *ActiveState*scps.service) echo ${options.managed === 'inactive' ? 'inactive' : 'active'};;
  'is-enabled --quiet scps-update.path') [ "$MANAGED" = active ];;
  'is-active --quiet scps-update.path') [ "$MANAGED" = active ];;
esac`);
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
    const result = spawnSync('/bin/sh', [join(root, 'scripts/setup.sh'), ...args], { encoding: 'utf8', input: '', env: { ...gitEnv, USER: userInfo().username, SUDO_USER: '', PATH: `${bin}:/usr/bin:/bin`, LOG: log, ROOT: root, MANAGED: options.managed } });
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

test('setup fast-forwards and runs the updated bootstrap before installing dependencies', () => {
  const f = fixture({ old: 'good' });
  try {
    git(f.root, 'clone', './origin.git', 'upstream');
    const upstream = join(f.root, 'upstream');
    const script = join(upstream, 'scripts/setup.sh');
    const previous = readFileSync(script, 'utf8');
    writeFileSync(script, previous.replace('sudo apt-get update', 'echo "updated bootstrap" >> "$LOG"\nsudo apt-get update'));
    git(upstream, 'add', 'scripts/setup.sh');
    git(upstream, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'update setup');
    git(upstream, 'push');
    const updated = git(upstream, 'rev-parse', 'HEAD');

    const r = f.run('--systemd');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), updated);
    assert.match(r.calls, /updated bootstrap\nsudo apt-get update/);
    assert.match(r.calls, /typed .*--systemd/);

    git(f.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'local change');
    git(upstream, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'remote change');
    git(upstream, 'push');
    const diverged = f.run('--no-systemd');
    assert.notEqual(diverged.status, 0);
    assert.equal(diverged.calls, r.calls);
  } finally { f.cleanup(); }
});

test('setup refuses a dirty checkout before installing dependencies', () => {
  const f = fixture({ old: 'good' });
  try {
    writeFileSync(join(f.root, 'local-notes'), 'keep me');
    const r = f.run();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /dirty|uncommitted/i);
    assert.equal(r.calls, '');
  } finally { f.cleanup(); }
});

test('remembers a successful setup without systemd', () => {
  const f = fixture({ old: 'good' });
  try {
    assert.equal(f.run('--no-systemd').status, 0);
    assert.ok(existsSync(join(f.root, '.local/setup-no-systemd')));
    const rerun = f.run();
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(rerun.stdout, /Reusing the previous setup choice/);
    assert.match(rerun.calls, /typed .*--no-systemd/);
  } finally { f.cleanup(); }
});

test('detects a previously installed service and skips the service prompt', () => {
  const f = fixture({ old: 'good', managed: 'existing' });
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /typed .*--systemd/);
    assert.doesNotMatch(result.stdout, /skipping systemd services|Install and enable/);
  } finally { f.cleanup(); }
});

for (const managed of ['active', 'inactive', 'busy', 'foreign'] as const) {
  test(`configured updater rerun leaves the release checkout alone (${managed})`, () => {
    const f = fixture({ old: 'good', managed });
    try {
      writeFileSync(join(f.root, 'local-notes'), 'keep me');
      const result = f.run();
      assert.equal(result.status, managed === 'foreign' ? 1 : 0, result.stderr);
      assert.doesNotMatch(result.calls, /apt |npm install|typed |Install and enable/);
      assert.equal(result.calls.includes('restart scps.service'), false);
      assert.equal(result.calls.includes('start scps.service'), managed === 'inactive');
      assert.equal(result.calls.includes('enable --now scps-update.path'), managed === 'inactive');
    } finally { f.cleanup(); }
  });
}

test('a managed rerun fixes the old default stop timeout without restarting web', () => {
  const f = fixture({ managed: 'active', stopTimeout: '1min 30s' });
  try {
    const first = f.run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(readFileSync(join(f.root, 'restart-timeout.conf'), 'utf8'), '[Service]\nTimeoutStopSec=20s\n');
    assert.match(first.calls, /systemctl daemon-reload/);
    assert.doesNotMatch(first.calls, /systemctl (start|restart) scps\.service/);
    assert.equal(f.run().calls, first.calls);
  } finally { f.cleanup(); }
});
