import fs from "node:fs";
import path from "node:path";

function resolveExistingPath(candidates: string[]) {
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existingPath) {
    throw new Error(`Required file not found. Checked: ${candidates.join(", ")}`);
  }
  return existingPath;
}

export function getProjectRoot() {
  return path.resolve(process.cwd(), "..");
}

export function getBackupScriptPath() {
  const configuredPath = process.env.WEB_BACKUP_SCRIPT?.trim();
  if (configuredPath) {
    return resolveExistingPath([configuredPath]);
  }

  return resolveExistingPath([path.join(getProjectRoot(), "scripts", "web_backup.sh")]);
}

export function getFixReadersScriptPath() {
  const configuredPath = process.env.FIX_READERS_SCRIPT_PATH?.trim();
  if (configuredPath) {
    return resolveExistingPath([configuredPath]);
  }

  return resolveExistingPath([path.join(getProjectRoot(), "scripts", "fix-readers.sh")]);
}
