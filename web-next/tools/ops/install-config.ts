import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function installConfig(destination: string, contents: string, mode: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-install-"));
  try {
    // install opens its source by path; Node subprocess stdin can be a socket.
    const source = path.join(directory, "config");
    fs.writeFileSync(source, contents, { flag: "wx", mode: 0o600 });
    execFileSync("sudo", ["install", "-D", `-m${mode}`, source, destination], { stdio: "inherit" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
