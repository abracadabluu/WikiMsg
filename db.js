const Database = require('better-sqlite3');
const path = require('path');

// The DB file lives next to this file, on the server's disk.
const db = new Database(path.join(__dirname, 'wikimsg.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  token TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  owner_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_views (
  post_id INTEGER NOT NULL,
  viewer_id INTEGER NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, viewer_id)
);
`);

module.exports = db;
