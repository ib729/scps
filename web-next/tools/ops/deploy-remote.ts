import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { quoteRemote, ssh } from "../remote-cli";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: node --import tsx tools/ops/deploy-remote.ts <user>@<host> [branch]\nDeploy main by default using ssh -t. SCPS_REMOTE_PATH selects the remote repository; when unset, use the remote user's HOME/scps.");
    return;
  }
  if (!args[0] || args.length > 2) throw new Error("Usage: deploy-remote.ts <user>@<host> [branch]");
  const target = args[0];
  if (target.startsWith("-") || !/^(?:[A-Za-z0-9_.-]+@)?[A-Za-z0-9_.:[\]-]+$/.test(target)) throw new Error("Invalid SSH target");
  const branch = args[1] || "main";
  // Only the built-in default expands HOME; configured directory names are literal.
  const directory = process.env.SCPS_REMOTE_PATH ? quoteRemote(process.env.SCPS_REMOTE_PATH) : '"$HOME"/scps';
  const command = `cd -- ${directory} && cd -- 'web-next' && ${["node", "--import", "tsx", "tools/ops/deploy-vps.ts", branch].map(quoteRemote).join(" ")}`;
  await ssh(["-t", "--", target, command]);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
