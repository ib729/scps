import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { main as run } from "./run-nfc";

export function main(args = process.argv.slice(2)): Promise<number> {
  return run(["--test", ...args]);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
