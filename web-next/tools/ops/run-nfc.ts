import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";

export async function main(args = process.argv.slice(2)): Promise<number> {
  const loaded = config({ path: fileURLToPath(new URL("../../../.env.broadcaster", import.meta.url)), override: false, quiet: true });
  if (loaded.error && loaded.error.code !== "ENOENT") throw loaded.error;
  const { main: broadcast } = await import("../../hardware/tap-broadcaster");
  return broadcast(args);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
