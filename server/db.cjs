const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'data.db')

let db

function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables()
  }
  return db
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_series ON reviews(series_id);

    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_zh TEXT NOT NULL,
      title_en TEXT NOT NULL DEFAULT '',
      title_th TEXT NOT NULL DEFAULT '',
      poster TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL,
      start_date TEXT NOT NULL,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      aired_episodes INTEGER NOT NULL DEFAULT 0,
      update_day TEXT NOT NULL DEFAULT '',
      cp_name TEXT NOT NULL DEFAULT '',
      synopsis TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'upcoming',
      watch_links TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Migrate: add sort_order if missing (safe to run on existing DBs)
  const cols = db.prepare("PRAGMA table_info('series')").all()
  if (!cols.some(c => c.name === 'sort_order')) {
    db.prepare('ALTER TABLE series ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0').run()
  }
}

module.exports = { getDb }
