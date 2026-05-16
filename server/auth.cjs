const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { getDb } = require('./db.cjs')

const JWT_SECRET = process.env.JWT_SECRET || 'thai-gl-tracker-secret-2026'
const JWT_EXPIRES = '7d'

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' })
  }
  try {
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1]
      req.user = jwt.verify(token, JWT_SECRET)
    } catch {}
  }
  next()
}

function setupAuthRoutes(app) {
  // Register
  app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body
    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写所有字段' })
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名需要2-20个字符' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要6个字符' })
    }

    const db = getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)
    if (existing) {
      return res.status(409).json({ error: '用户名或邮箱已被注册' })
    }

    const hash = bcrypt.hashSync(password, 10)
    const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash)
    const token = generateToken({ id: result.lastInsertRowid, username })

    res.json({ token, user: { id: result.lastInsertRowid, username, email } })
  })

  // Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' })
    }

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    const token = generateToken(user)
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } })
  })

  // Get current user
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const db = getDb()
    const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.user.id)
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json({ user })
  })
}

module.exports = { setupAuthRoutes, authMiddleware, optionalAuth }
