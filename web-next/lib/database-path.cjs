const fs = require('node:fs');
const path = require('node:path');
const webDirectory = path.resolve(__dirname, '..');

function resolveDatabasePath() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured && configured !== '/absolute/path/to/stuco.db') {
    return path.resolve(webDirectory, configured);
  }
  const webDatabase = path.join(webDirectory, 'stuco.db');
  return fs.existsSync(webDatabase) ? webDatabase : path.resolve(webDirectory, '..', 'stuco.db');
}

module.exports = { resolveDatabasePath };

if (require.main === module) {
  const result = require('dotenv').config({ path: path.join(webDirectory, '.env.local'), override: false, quiet: true });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  console.log(resolveDatabasePath());
}
