// Quick test to verify database connectivity
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || '/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db';

console.log('Testing database connection...');
console.log('Database path:', dbPath);

try {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  
  console.log('\n✅ Database connected successfully!');
  
  // List tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n📋 Tables:', tables.map(t => t.name).join(', '));
  
  // Get students
  const students = db.prepare('SELECT * FROM students').all();
  console.log('\n👥 Students:', students.length);
  students.forEach(s => {
    const account = db.prepare('SELECT * FROM accounts WHERE student_id = ?').get(s.id);
    console.log(`  - ${s.name} (ID: ${s.id}, Balance: ¥${account?.balance || 0})`);
  });
  
  // Get transactions count
  const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
  console.log('\n💰 Transactions:', txCount.count);
  
  db.close();
  console.log('\n✅ All checks passed!');
  console.log('\nYou can now run: pnpm dev');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('\nPlease run the setup script:');
  console.error('  ./setup.sh');
  process.exit(1);
}

