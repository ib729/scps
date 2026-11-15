const columns = ['id', 'name', 'email', 'emailVerified', 'image', 'role', 'createdAt', 'updatedAt'];
const userDefinition = `(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER DEFAULT 0,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin','staff','student')),
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)`;

/** @param {import('better-sqlite3').Database} database @returns {void} */
function ensureUserSchema(database) {
  const foreignKeys = database.pragma('foreign_keys', { simple: true });
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      const table = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='user'").get();
      if (!table) throw new Error('Initialize the Better Auth schema before starting SCPS');
      const actual = database.pragma('table_xinfo(user)').map(column => column.name);
      const unexpected = actual.filter(column => !columns.includes(column));
      const missing = columns.filter(column => column !== 'role' && !actual.includes(column));
      if (unexpected.length || missing.length) {
        throw new Error(`Unsupported user schema; migrate a backup copy before starting SCPS (unexpected columns: ${unexpected.join(', ') || 'none'}; missing columns: ${missing.join(', ') || 'none'})`);
      }
      const roleColumn = database.pragma('table_info(user)').find(column => column.name === 'role');
      if (!roleColumn || roleColumn.dflt_value !== "'student'" || !/CHECK\s*\(\s*role\s+IN\s*\(\s*'admin'\s*,\s*'staff'\s*,\s*'student'\s*\)\s*\)/i.test(table.sql)) {
        const objects = database.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='user' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
        database.exec(`CREATE TABLE user_replacement ${userDefinition}`);
        const role = roleColumn ? "CASE WHEN role IN ('admin','staff','student') THEN role ELSE 'student' END" : "'staff'";
        database.exec(`INSERT INTO user_replacement (${columns.join(',')}) SELECT id,name,email,emailVerified,image,${role},createdAt,updatedAt FROM user; DROP TABLE user; ALTER TABLE user_replacement RENAME TO user;`);
        for (const object of objects) database.exec(object.sql);
      }
      database.exec(`CREATE TABLE IF NOT EXISTS user_student_links (
        user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE RESTRICT
      )`);
      const violations = database.pragma('foreign_key_check');
      if (violations.length) throw new Error(`User schema foreign key check failed: ${JSON.stringify(violations)}`);
    }).immediate();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
}
module.exports = { ensureUserSchema };
