import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function checkPrerequisites(): boolean {
  console.log(`Checking native-build prerequisites (${os.platform()} ${os.arch()}); Python is build-only, not an application runtime.`);
  let ready = true;
  const check = (command: string, args: string[], valid: (output: string) => boolean, advice: string, required = true) => {
    try {
      const output = execFileSync(command, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim();
      if (!valid(output)) throw new Error(`Unsupported version: ${output.split("\n")[0]}`);
      console.log(`✓ ${command}: ${output.split("\n")[0]}`);
    } catch (error) {
      console.error(`${required ? "Missing requirement" : "Recommended"}: ${advice} (${error instanceof Error ? error.message : String(error)})`);
      if (required) ready = false;
    }
  };
  check("node", ["--version"], value => {
    const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return !!match && Number(match[1]) === 26 && (Number(match[2]) > 13 || Number(match[2]) === 13 && Number(match[3]) >= 1);
  }, "Install Node.js >=26.13.1 <27");
  check("pnpm", ["--version"], value => value === "12.21.0", "Install pnpm@12.21.0 into .local/pnpm and export its node_modules/.bin in PATH");
  check("python3", ["--version"], value => {
    const match = /^Python (\d+)\.(\d+)/.exec(value);
    return !!match && (Number(match[1]) > 3 || Number(match[1]) === 3 && Number(match[2]) >= 11);
  }, "Install Python >=3.11 for native addon compilation only");
  if (os.platform() === "linux") {
    for (const command of ["gcc", "g++", "make"]) check(command, ["--version"], () => true, "Install build-essential");
    check("pkg-config", ["--version"], () => true, "Install pkg-config", false);
  } else if (os.platform() === "darwin") {
    check("xcodebuild", ["-version"], () => true, "Install Xcode command-line tools with xcode-select --install");
  }
  console.log(ready ? "Native-build prerequisites are installed; pnpm install builds better-sqlite3." : "Install the missing prerequisites before rebuilding dependencies.");
  return ready;
}

export function main(args = process.argv.slice(2)): number {
  if (args.includes("--help") || args.includes("-h")) { console.log("Usage: node --import tsx tools/ops/web-next-check-prereqs.ts\nRead-only checks for the pinned Node/pnpm and third-party native addon build toolchain."); return 0; }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  return checkPrerequisites() ? 0 : 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { process.exitCode = main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
