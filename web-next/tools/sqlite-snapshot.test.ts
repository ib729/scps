import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { pack, type Header } from "tar-stream";
import { backupDatabase, extractBackup } from "./sqlite-snapshot";

type HeaderArgument = Partial<Header> & Pick<Header, "name">;

const web = path.resolve(import.meta.dirname, "..");

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps archive ' "));
  const filename = path.join(directory, "live ledger.db");
  const database = new Database(filename);
  database.pragma("journal_mode=WAL");
  database.exec("CREATE TABLE ledger(balance INTEGER); INSERT INTO ledger VALUES(731)");
  t.after(() => { database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, filename, database };
}

async function tarBytes(entries: Array<{ header: HeaderArgument; body?: Buffer }>) {
  const archive = pack();
  const chunks: Buffer[] = [];
  const collecting = (async () => {
    for await (const chunk of archive) {
      assert.ok(Buffer.isBuffer(chunk));
      chunks.push(chunk);
    }
  })();
  for (const { header, body } of entries) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    archive.entry(header, body ?? Buffer.alloc(0), error => error ? reject(error) : resolve());
    await promise;
  }
  archive.finalize();
  await collecting;
  return Buffer.concat(chunks);
}

function compress(directory: string, raw: Buffer) {
  const result = spawnSync("zstd", ["-q", "-c"], { input: raw, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  const filename = path.join(directory, "backup.tar.zst");
  fs.writeFileSync(filename, result.stdout);
  return filename;
}

function balance(filename: string) {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try { return database.prepare("SELECT balance FROM ledger").pluck().get(); }
  finally { database.close(); }
}

test("online snapshot includes committed WAL, is exclusive/private and never creates a missing source", async t => {
  const { directory, filename, database } = fixture(t);
  const target = path.join(directory, "nested", "stuco.db");
  await backupDatabase(filename, target);
  assert.equal(balance(target), 731);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${target}-wal`), false);
  assert.equal(fs.existsSync(`${target}-shm`), false);
  await assert.rejects(backupDatabase(filename, filename));
  const hardlink = path.join(directory, "same-inode.db");
  fs.linkSync(filename, hardlink);
  await assert.rejects(backupDatabase(filename, hardlink));
  const symlink = path.join(directory, "same-inode-symlink.db");
  fs.symlinkSync(filename, symlink);
  await assert.rejects(backupDatabase(filename, symlink));
  await assert.rejects(backupDatabase(filename, target));
  const guarded = path.join(directory, "guarded.db");
  fs.writeFileSync(`${guarded}-wal`, "existing sidecar");
  await assert.rejects(backupDatabase(filename, guarded));
  assert.equal(fs.existsSync(guarded), false);
  assert.equal(fs.readFileSync(`${guarded}-wal`, "utf8"), "existing sidecar");
  const missing = path.join(directory, "missing.db");
  await assert.rejects(backupDatabase(missing, path.join(directory, "missing-copy.db")));
  assert.equal(fs.existsSync(missing), false);
  assert.equal(fs.existsSync(path.join(directory, "missing-copy.db")), false);
  assert.equal(database.prepare("SELECT balance FROM ledger").pluck().get(), 731);
});

test("failed integrity and foreign-key validation removes only the incomplete snapshot", async t => {
  const { directory } = fixture(t);
  const invalid = path.join(directory, "foreign-key.db");
  const database = new Database(invalid);
  database.pragma("foreign_keys=OFF");
  database.exec("CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE children(parent_id REFERENCES parents(id)); INSERT INTO children VALUES(5)");
  database.close();
  const target = path.join(directory, "invalid-copy.db");
  await assert.rejects(backupDatabase(invalid, target), /foreign.key|integrity/i);
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(invalid, "not a SQLite database");
  await assert.rejects(backupDatabase(invalid, target));
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.readFileSync(invalid, "utf8"), "not a SQLite database");
});

test("legacy main/WAL/SHM archive folds WAL into a verified standalone snapshot without altering live files", async t => {
  const { directory, filename, database } = fixture(t);
  const before = new Map([filename, `${filename}-wal`, `${filename}-shm`].map(name => [name, fs.readFileSync(name)]));
  const raw = await tarBytes([
    { header: { name: "stuco.db" }, body: before.get(filename) },
    { header: { name: "stuco.db-wal" }, body: before.get(`${filename}-wal`) },
    { header: { name: "stuco.db-shm" }, body: before.get(`${filename}-shm`) },
  ]);
  const stage = path.join(directory, "stage");
  fs.mkdirSync(stage);
  const extracted = await extractBackup(compress(directory, raw), stage);
  assert.equal(extracted, path.join(stage, "stuco.db"));
  assert.deepEqual(fs.readdirSync(stage), ["stuco.db"]);
  assert.equal(fs.statSync(stage).mode & 0o777, 0o700);
  assert.equal(fs.statSync(extracted).mode & 0o777, 0o600);
  assert.equal(balance(extracted), 731);
  for (const [name, content] of before) assert.deepEqual(fs.readFileSync(name), content);
  assert.equal(database.prepare("SELECT balance FROM ledger").pluck().get(), 731);
});

test("extraction refuses traversal, absolute, links, duplicate, unexpected and WAL-only members and cleans partial files", async t => {
  const { directory, filename, database } = fixture(t);
  const snapshot = path.join(directory, "clean.db");
  await backupDatabase(filename, snapshot);
  const body = fs.readFileSync(snapshot);
  const cases: HeaderArgument[][] = [
    [{ name: "../stuco.db" }], [{ name: "/stuco.db" }],
    [{ name: "nested/stuco.db" }], [{ name: "./stuco.db" }],
    [{ name: "stuco.db", type: "symlink", linkname: filename }],
    [{ name: "stuco.db", type: "link", linkname: filename }],
    [{ name: "stuco.db", type: "directory" }],
    [{ name: "stuco.db" }, { name: "stuco.db" }],
    [{ name: "stuco.db" }, { name: "scps_2026-11-17T12-30-00-000Z.db" }],
    [{ name: "scps_2026-11-17T12-30-00-000Z.db" }, { name: "scps_2026-11-17T12-30-00-001Z.db" }],
    [{ name: "../scps_2026-11-17T12-30-00-000Z.db" }],
    [{ name: "stuco.db" }, { name: "other.db" }],
    [{ name: "stuco.db-wal" }], [],
  ];
  for (const [index, headers] of cases.entries()) {
    const raw = await tarBytes(headers.map(header => ({ header, body: header.type && header.type !== "file" ? undefined : body })));
    const stage = path.join(directory, `unsafe-${index}`);
    fs.mkdirSync(stage, { mode: 0o700 });
    await assert.rejects(extractBackup(compress(directory, raw), stage), `case ${index}`);
    assert.deepEqual(fs.readdirSync(stage), [], `case ${index} left partial files`);
    assert.equal(database.prepare("SELECT balance FROM ledger").pluck().get(), 731);
  }
  assert.equal(fs.existsSync(path.join(directory, "stuco.db")), false);
});

test("extraction rejects truncated compression and tar framing, including bytes after the tar end", async t => {
  const { directory, filename } = fixture(t);
  const snapshot = path.join(directory, "clean.db");
  await backupDatabase(filename, snapshot);
  const raw = await tarBytes([{ header: { name: "stuco.db" }, body: fs.readFileSync(snapshot) }]);
  const variants = [raw.subarray(0, -1024), raw.subarray(0, -512), raw.subarray(0, -1), Buffer.concat([raw, Buffer.from([0])]), Buffer.concat([raw, Buffer.alloc(512, 1), Buffer.alloc(1024)])];
  for (const [index, bytes] of variants.entries()) {
    const stage = path.join(directory, `truncated-${index}`);
    fs.mkdirSync(stage);
    await assert.rejects(extractBackup(compress(directory, bytes), stage));
    assert.deepEqual(fs.readdirSync(stage), []);
  }
  const compressed = compress(directory, raw);
  fs.truncateSync(compressed, 20);
  const stage = path.join(directory, "truncated-zstd");
  fs.mkdirSync(stage);
  await assert.rejects(extractBackup(compressed, stage));
  assert.deepEqual(fs.readdirSync(stage), []);
});

test("extraction requires empty real staging and preserves pre-existing files", async t => {
  const { directory, filename } = fixture(t);
  const stage = path.join(directory, "nonempty");
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, "keep"), "original");
  await assert.rejects(extractBackup(filename, stage), /empty/i);
  assert.equal(fs.readFileSync(path.join(stage, "keep"), "utf8"), "original");
  const linked = path.join(directory, "linked-stage");
  fs.symlinkSync(stage, linked);
  await assert.rejects(extractBackup(filename, linked));
});

test("CLI checks zstd exit after a complete tar and terminates a failed producer without leaking staged files", async t => {
  const { directory, filename } = fixture(t);
  const snapshot = path.join(directory, "clean.db");
  await backupDatabase(filename, snapshot);
  const raw = await tarBytes([{ header: { name: "stuco.db" }, body: fs.readFileSync(snapshot) }]);
  const archive = path.join(directory, "raw.tar");
  fs.writeFileSync(archive, raw);
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  const executable = path.join(bin, "zstd");
  for (const [index, script] of [
    '#!/bin/sh\ncat "$3"\nexit 7\n',
    '#!/bin/sh\ntrap "" TERM\ncat "$3"\nexec sleep 60\n',
  ].entries()) {
    if (index === 1) fs.writeFileSync(archive, await tarBytes([{ header: { name: "../escape" }, body: Buffer.from("x") }]));
    fs.writeFileSync(executable, script, { mode: 0o700 });
    const stage = path.join(directory, `failed-zstd-${index}`);
    fs.mkdirSync(stage);
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/sqlite-snapshot.ts", "extract", archive, stage], {
      cwd: web, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.deepEqual(fs.readdirSync(stage), []);
  }
});

test("snapshot/extract CLI works from root and package cwd and prints only the extracted path", async t => {
  const { directory, filename } = fixture(t);
  for (const [index, cwd] of [path.dirname(web), web].entries()) {
    const snapshot = path.join(directory, `cli-${index}.db`);
    const run = (args: string[]) => spawnSync(process.execPath, ["--import", path.join(web, "node_modules/tsx/dist/loader.mjs"), path.join(web, "tools/sqlite-snapshot.ts"), ...args], { cwd, encoding: "utf8", timeout: 10_000 });
    const saved = run(["snapshot", filename, snapshot]);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(saved.stdout, "");
    const raw = await tarBytes([{ header: { name: "stuco.db" }, body: fs.readFileSync(snapshot) }]);
    const stage = path.join(directory, `cli-stage-${index}`);
    fs.mkdirSync(stage);
    const extracted = run(["extract", compress(directory, raw), stage]);
    assert.equal(extracted.status, 0, extracted.stderr);
    assert.equal(extracted.stdout, `${path.join(stage, "stuco.db")}\n`);
    assert.equal(balance(path.join(stage, "stuco.db")), 731);
  }
});
