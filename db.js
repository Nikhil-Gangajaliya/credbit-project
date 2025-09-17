// db.js
// Run `node db.js --init` to create DB and tables

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.db');

function init() {
  if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
  const db = new Database(DB_FILE);

  // enable foreign keys
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      mobile TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL, -- ISO date yyyy-mm-dd
      party_id INTEGER,
      party_name TEXT,
      purpose TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE SET NULL
    );
  `);

  // create default admin if not exists
  const bcryptjs = require('bcryptjs');
  const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?)').run('admin', hash);
    console.log('Created default admin (username: admin, password: admin123). Change it immediately.');
  }

  db.close();
  console.log('DB initialized at', DB_FILE);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--init')) init();
}

module.exports = {
  path: DB_FILE
};
