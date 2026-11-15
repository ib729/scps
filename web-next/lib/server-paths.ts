import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveExistingPath(filename: string): string {
  if (!fs.existsSync(filename)) throw new Error(`Required tool not found: ${filename}`);
  return filename;
}

export function getProjectRoot(): string {
  return path.resolve(webDirectory, "..");
}

export function getBackupScriptPath(): string {
  return resolveExistingPath(path.resolve(webDirectory, process.env.WEB_BACKUP_SCRIPT?.trim() || "tools/ops/web_backup.ts"));
}

export function getFixReadersScriptPath(): string {
  return resolveExistingPath(path.resolve(webDirectory, process.env.FIX_READERS_SCRIPT_PATH?.trim() || "tools/ops/fix-readers.ts"));
}
