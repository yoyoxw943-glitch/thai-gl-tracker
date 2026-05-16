let db, dbType

async function getClient() {
  if (dbType) return
  if (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING) {
    const { neon } = await import('@neondatabase/serverless')
    db = neon(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING)
    dbType = 'pg'
    // Init tables on first run
    await db(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await db(`CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      series_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await db(`CREATE INDEX IF NOT EXISTS idx_reviews_series ON reviews(series_id)`)
  } else {
    const { default: Database } = await import('better-sqlite3')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    db = new Database(path.join(__dirname, '..', 'server', 'data.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
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
    `)
    dbType = 'sqlite'
  }
}

export async function query(sql, params = []) {
  await getClient()
  const upperSql = sql.trim().toUpperCase()

  if (dbType === 'pg') {
    const result = await db(sql, params)
    return { rows: Array.isArray(result) ? result : [] }
  }

  // SQLite
  const isSelect = upperSql.startsWith('SELECT')
  const isReturning = upperSql.includes('RETURNING')
  const sqliteSql = sql.replace(/\$\d+/g, '?')

  if (isSelect) {
    return { rows: db.prepare(sqliteSql).all(...params) }
  }

  if (isReturning) {
    const returningIdx = upperSql.indexOf('RETURNING')
    const insertSqlPart = sql.substring(0, returningIdx).trim()
    const returningCols = sql.substring(returningIdx + 9).trim()
    const insertSqlForSQLite = insertSqlPart.replace(/\$\d+/g, '?')
    const result = db.prepare(insertSqlForSQLite).run(...params)
    const id = result.lastInsertRowid
    if (returningCols === '*') {
      const tableName = upperSql.includes('INTO USERS') ? 'users' : 'reviews'
      return { rows: db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).all(id) }
    }
    return { rows: [{ id }] }
  }

  const result = db.prepare(sqliteSql).run(...params)
  return { rows: [], changes: result.changes, lastInsertRowid: result.lastInsertRowid }
}
