import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function installConfig(destination: string, contents: string, mode: string, options?: { preserveExisting: boolean }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-install-"));
  try {
    // Use the same regular file for validation, comparison, and installation.
    const source = path.join(directory, "config");
    fs.writeFileSync(source, contents, { flag: "wx", mode: 0o600 });
    if (destination.startsWith("/etc/sudoers.d/")) {
      execFileSync("sudo", ["visudo", "-cf", source], { stdio: "inherit" });
    }
    if (options?.preserveExisting) {
      let installed = false;
      try {
        execFileSync("sudo", ["test", "-e", destination], { stdio: "ignore" });
        installed = true;
      } catch (error) {
        if (!(error instanceof Error && "status" in error && error.status === 1)) throw error;
      }
      if (installed) {
        try { execFileSync("sudo", ["cmp", "-s", source, destination]); }
        catch (error) {
          if (!(error instanceof Error && "status" in error && error.status === 1)) throw error;
          throw new Error(`Refusing to replace existing updater configuration: ${destination}`);
        }
        return;
      }
    }
    execFileSync("sudo", ["install", "-D", `-m${mode}`, source, destination], { stdio: "inherit" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
