const { getDb } = require('./db.cjs')

const email = process.argv[2]
if (!email) {
  console.error('Usage: node server/make-admin.cjs <email>')
  process.exit(1)
}

const db = getDb()
const user = db.prepare('SELECT id, username, email FROM users WHERE email = ?').get(email)
if (!user) {
  console.error(`User not found: ${email}`)
  process.exit(1)
}

db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email)
console.log(`User "${user.username}" (${user.email}) is now admin.`)
