import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { pack } from "tar-stream";
import { resolveDatabasePath } from "../../lib/database-path";
import { backupDatabase } from "../sqlite-snapshot";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const environment = config({ path: path.join(web, ".env.local"), override: false, quiet: true });
if (environment.error && environment.error.code !== "ENOENT") throw environment.error;

export async function createWebBackup(outputFile: string, timestamp = new Date().toISOString().replace(/[:.]/g, "-")): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(timestamp)) throw new Error("Invalid backup timestamp");
  const source = resolveDatabasePath();
  const level = process.env.ZSTD_CLEVEL || "15";
  const threads = process.env.ZSTD_NBTHREADS || "0";
  if (!/^-?\d+$/.test(level) || !/^\d+$/.test(threads)) throw new Error("ZSTD_CLEVEL must be an integer and ZSTD_NBTHREADS a nonnegative integer");
  const output = path.resolve(outputFile);
  const sourceInfo = await fsp.stat(source);
  try {
    const destination = await fsp.stat(output);
    if (destination.dev === sourceInfo.dev && destination.ino === sourceInfo.ino) throw new Error("Cannot replace the live database with an archive");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const sourceName = await fsp.realpath(source);
  const destinationName = path.join(await fsp.realpath(path.dirname(output)), path.basename(output));
  if (["", "-wal", "-shm", "-journal"].some(suffix => destinationName === sourceName + suffix || output === source + suffix)) throw new Error("Cannot replace live SQLite files with an archive");
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "scps-backup-"));
  let pending: string | undefined;
  try {
    const snapshot = path.join(staging, "stuco.db");
    await backupDatabase(source, snapshot);
    const pendingDirectory = await fsp.mkdtemp(path.join(path.dirname(output), ".scps-backup."));
    pending = pendingDirectory;
    const pendingFile = path.join(pendingDirectory, "archive.tar.zst");
    const snapshotSize = (await fsp.stat(snapshot)).size;
    const archive = pack();
    const compressor = spawn("zstd", [Number(level) < 0 ? `--fast=${level.slice(1)}` : `-${level}`, `-T${threads}`, "-c"], { stdio: ["pipe", "pipe", "inherit"] });
    const { promise: closed, resolve: resolveClosed, reject: rejectClosed } = Promise.withResolvers<{ status: number | null; signal: NodeJS.Signals | null }>();
    compressor.once("error", rejectClosed);
    compressor.once("close", (status, signal) => resolveClosed({ status, signal }));
    let interrupted: NodeJS.Signals | undefined;
    let escalation: NodeJS.Timeout | undefined;
    const interrupt = (signal: NodeJS.Signals) => {
      interrupted = signal;
      compressor.kill(signal);
      escalation ??= setTimeout(() => { compressor.kill("SIGKILL"); }, 1000);
      escalation.unref();
    };
    const onInt = () => interrupt("SIGINT");
    const onTerm = () => interrupt("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    try {
      const entry = archive.entry({ name: `scps_${timestamp}.db`, size: snapshotSize, mode: 0o600 });
      const reading = pipeline(fs.createReadStream(snapshot), entry).catch(error => { archive.destroy(error); throw error; });
      archive.finalize();
      const results = await Promise.allSettled([
        reading,
        pipeline(archive, compressor.stdin),
        pipeline(compressor.stdout, fs.createWriteStream(pendingFile, { flags: "wx", mode: 0o600 })),
        closed,
      ]);
      const child = results[3];
      if (child.status === "rejected") throw child.reason;
      if (interrupted || child.value.status !== 0 || child.value.signal) throw Object.assign(new Error("Backup compression failed"), { status: child.value.status, signal: interrupted ?? child.value.signal });
      for (const result of results) if (result.status === "rejected") throw result.reason;
    } finally {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      clearTimeout(escalation);
    }
    await fsp.rename(pendingFile, output);
    console.log(`Backup created at ${output}`);
    return output;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
    if (pending) await fsp.rm(pending, { recursive: true, force: true });
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log("Usage: node --import tsx tools/ops/web_backup.ts <output_file> [timestamp]"); return; }
  if (args.length < 1 || args.length > 2) throw new Error("Usage: node --import tsx tools/ops/web_backup.ts <output_file> [timestamp]");
  await createWebBackup(args[0], args[1]);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
