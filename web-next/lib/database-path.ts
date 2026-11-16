import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from 'dotenv';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured && configured !== '/absolute/path/to/stuco.db' && configured !== '/absolute/path/to/scps.db') {
    return path.resolve(webDirectory, configured);
  }
  const candidates = [
    path.join(webDirectory, 'stuco.db'),
    path.resolve(webDirectory, '..', 'stuco.db'),
    path.join(webDirectory, 'scps.db'),
    path.resolve(webDirectory, '..', 'scps.db'),
  ];
  return candidates.find(file => fs.existsSync(file)) ?? candidates[3];
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const result = config({ path: path.join(webDirectory, '.env.local'), override: false, quiet: true });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  console.log(resolveDatabasePath());
}
