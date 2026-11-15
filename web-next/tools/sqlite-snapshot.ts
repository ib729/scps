import fs from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import Database from "better-sqlite3";
import { extract } from "tar-stream";

function verifyDatabase(database: Database.Database): void {
  const integrity = database.prepare("PRAGMA integrity_check").pluck().all();
  if (integrity.length !== 1 || integrity[0] !== "ok" || database.prepare("PRAGMA foreign_key_check").all().length) {
    throw new Error("Snapshot failed SQLite integrity or foreign-key checks");
  }
}

/** Read committed WAL through SQLite; never copy or alter a live database's files. */
export async function backupDatabase(sourcePath: string, backupPath: string): Promise<void> {
  const sourceName = await fs.realpath(sourcePath);
  const sourceInfo = await fs.stat(sourceName);
  if (!sourceInfo.isFile()) throw new Error("Snapshot source must be an existing regular file");
  const destination = path.resolve(backupPath);
  try {
    const existing = await fs.stat(destination);
    if (existing.dev === sourceInfo.dev && existing.ino === sourceInfo.ino) throw new Error("Source and snapshot must be different files");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await fs.lstat(`${destination}${suffix}`);
      throw new Error("Snapshot destination already has SQLite sidecars");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const source = new Database(sourceName, { readonly: true, fileMustExist: true });
  let reserved = false;
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const file = await fs.open(destination, "wx", 0o600);
    reserved = true;
    await file.close();
    await source.backup(destination);
    const snapshot = new Database(destination, { fileMustExist: true });
    try {
      snapshot.pragma("journal_mode=DELETE");
      verifyDatabase(snapshot);
    }
    finally { snapshot.close(); }
  } catch (error) {
    if (reserved) {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) await fs.rm(`${destination}${suffix}`, { force: true });
    }
    throw error;
  } finally { source.close(); }
}

/** Only an empty, private staging directory is ever modified by extraction. */
export async function extractBackup(archivePath: string, directory: string): Promise<string> {
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || (process.getuid && info.uid !== process.getuid())) throw new Error("Extraction requires a real staging directory owned by this user");
  const stage = await fs.realpath(directory);
  if ((await fs.readdir(stage)).length) throw new Error("Extraction requires an empty staging directory");
  await fs.chmod(stage, 0o700);
  const allowed: Record<string, true> = { "stuco.db": true, "stuco.db-wal": true, "stuco.db-shm": true };
  const names = new Set<string>();
  const created = new Set<string>();
  const archive = extract();
  const archiveClosed = new AbortController();
  archive.once("close", () => archiveClosed.abort());
  const decompressor = spawn("zstd", ["-dc", "--", path.resolve(archivePath)], { stdio: ["ignore", "pipe", "pipe"] });
  let spawnError: Error | undefined;
  let stderr = "";
  decompressor.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8192) stderr += chunk.toString("utf8").slice(0, 8192 - stderr.length); });
  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>();
  decompressor.once("error", error => { spawnError = error; });
  decompressor.once("close", (code, signal) => resolveClosed({ code, signal }));
  let size = 0;
  let lastEntryEnd = 0;
  let tail = Buffer.alloc(0);
  const entries = (async () => {
    for await (const entry of archive) {
      const header = entry.header;
      if (!Object.hasOwn(allowed, header.name) || header.type !== "file" || names.has(header.name) || !Number.isSafeInteger(header.size) || header.size < 0) {
        throw new Error("Unexpected, duplicate or unsafe backup member");
      }
      names.add(header.name);
      lastEntryEnd = entry.offset + 512 + Math.ceil(header.size / 512) * 512;
      const filename = path.join(stage, header.name);
      const file = await fs.open(filename, "wx", 0o600);
      created.add(filename);
      try {
        for await (const chunk of entry) {
          if (!Buffer.isBuffer(chunk)) throw new Error("Invalid tar entry data");
          await file.writeFile(chunk);
        }
      }
      finally { await file.close(); }
    }
  })();
  const feeding = (async () => {
    for await (const chunk of decompressor.stdout) {
      size += chunk.length;
      tail = chunk.length >= 1024 ? chunk.subarray(chunk.length - 1024) : Buffer.concat([tail, chunk]).subarray(-1024);
      if (!archive.write(chunk)) await once(archive, "drain", { signal: archiveClosed.signal });
    }
    archive.end(Buffer.alloc(0));
  })();
  try {
    // Consume the entire decompressor output, even after tar's zero blocks.
    await Promise.all([entries, feeding]);
    const status = await closed;
    if (spawnError) throw spawnError;
    if (status.code !== 0 || status.signal) throw new Error(`Backup decompression failed: ${stderr.trim() || status.signal || status.code}`);
    if (!names.has("stuco.db")) throw new Error("Backup is missing stuco.db");
    if (size % 512 || size < lastEntryEnd + 1024 || tail.length !== 1024 || tail.some(byte => byte !== 0)) throw new Error("Truncated tar archive");
    const main = path.join(stage, "stuco.db");
    const clean = path.join(stage, "validated.db");
    // Read-only SQLite may create SHM for a legacy WAL; these are staged, never live.
    for (const suffix of ["-wal", "-shm"]) created.add(`${main}${suffix}`);
    await backupDatabase(main, clean);
    created.add(clean);
    await fs.rename(clean, main);
    for (const suffix of ["-wal", "-shm"]) await fs.rm(`${main}${suffix}`, { force: true });
    return main;
  } catch (error) {
    archive.destroy(error instanceof Error ? error : new Error(String(error)));
    decompressor.kill("SIGTERM");
    const kill = setTimeout(() => decompressor.kill("SIGKILL"), 1000);
    kill.unref();
    decompressor.stdout.destroy();
    try { await Promise.allSettled([entries, feeding, closed]); }
    finally {
      clearTimeout(kill);
      for (const filename of created) await fs.rm(filename, { force: true });
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const [command, source, destination, ...extra] = process.argv.slice(2);
  if (!source || !destination || extra.length || (command !== "snapshot" && command !== "extract")) {
    throw new Error("Usage: sqlite-snapshot.ts snapshot SOURCE DEST | extract ARCHIVE DIRECTORY");
  }
  if (command === "snapshot") await backupDatabase(source, destination);
  else console.log(await extractBackup(source, destination));
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
