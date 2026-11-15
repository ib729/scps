import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repository = path.resolve(import.meta.dirname, "../../..");
const web = path.join(repository, "web-next");

async function run(command: string, args: string[], capture = false): Promise<string> {
  const child = spawn(command, args, { cwd: repository, stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"] });
  let output = "";
  let interrupted: NodeJS.Signals | undefined;
  const interrupt = () => { interrupted = "SIGINT"; child.kill("SIGINT"); };
  const terminate = () => { interrupted = "SIGTERM"; child.kill("SIGTERM"); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  child.stdout?.setEncoding("utf8").on("data", (data: string) => { output += data; });
  try {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    child.once("error", reject);
    child.once("close", (status, signal) => {
      if (status === 0 && !interrupted) resolve();
      else reject(Object.assign(new Error(`${command} failed (${interrupted ?? signal ?? status})`), { status, signal: interrupted ?? signal }));
    });
    await promise;
    return output.trim();
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: node --import tsx tools/ops/deploy-vps.ts [branch]\nDeploy the clean local checkout (default: main), install with the frozen lockfile, build and restart stuco-web.");
    return;
  }
  if (args.length > 1) throw new Error("Expected at most one branch");
  const branch = args[0] || "main";
  if (branch.startsWith("-") || /[\0\r\n]/.test(branch)) throw new Error("Invalid branch name");
  if (await run("git", ["status", "--porcelain"], true)) {
    throw new Error("Refusing to deploy with a dirty working tree on the VPS. Commit, stash, or discard local changes first.");
  }
  await run("git", ["fetch", "origin"]);
  if (await run("git", ["branch", "--show-current"], true) !== branch) {
    let exists = true;
    try { await run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]); }
    catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 1 || ("signal" in error && error.signal)) throw error;
      exists = false;
    }
    await run("git", exists ? ["checkout", branch] : ["checkout", "-b", branch, "--track", `origin/${branch}`]);
  }
  await run("git", ["pull", "--ff-only", "origin", branch]);
  await run("pnpm", ["--dir", web, "install", "--frozen-lockfile"]);
  await run("pnpm", ["--dir", web, "build"]);
  await run("sudo", ["systemctl", "restart", "stuco-web"]);
  await run("sudo", ["systemctl", "--no-pager", "--full", "status", "stuco-web"]);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
