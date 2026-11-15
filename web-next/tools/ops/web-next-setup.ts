import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPrerequisites } from "./web-next-check-prereqs";

export function main(args = process.argv.slice(2)): number {
  if (args.includes("--help") || args.includes("-h")) { console.log("Usage: node --import tsx tools/ops/web-next-setup.ts\nCheck native-build tools, install frozen dependencies and rebuild better-sqlite3."); return 0; }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  if (!checkPrerequisites()) return 1;
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd, stdio: "inherit" });
  execFileSync("pnpm", ["rebuild", "better-sqlite3"], { cwd, stdio: "inherit" });
  console.log("Setup complete. Start with: cd web-next && pnpm dev");
  return 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { process.exitCode = main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  }
}
