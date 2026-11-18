import { spawn } from "node:child_process";
import { totalmem } from "node:os";

const memory = Math.min(totalmem(), process.constrainedMemory() || Infinity);
const env = { ...process.env };
if (memory <= 2 * 1024 ** 3) {
  env.SCPS_LOW_MEMORY_BUILD = "1";
  if (!/--max[-_]old[-_]space[-_]size(?:[=\s]|$)/.test(env.NODE_OPTIONS ?? "")) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=768"].filter(Boolean).join(" ");
  }
}

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack", ...process.argv.slice(2)], { env, stdio: "inherit" });
child.once("error", error => { console.error(error); process.exitCode = 1; });
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
