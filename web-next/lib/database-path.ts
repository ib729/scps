import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from 'dotenv';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured && configured !== '/absolute/path/to/stuco.db') {
    return path.resolve(webDirectory, configured);
  }
  const webDatabase = path.join(webDirectory, 'stuco.db');
  return fs.existsSync(webDatabase) ? webDatabase : path.resolve(webDirectory, '..', 'stuco.db');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = config({ path: path.join(webDirectory, '.env.local'), override: false, quiet: true });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  console.log(resolveDatabasePath());
}
