import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from './db.js'

const app = express()
app.use(cors())
app.use(express.json())

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
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.split(' ')[1], JWT_SECRET) } catch {}
  }
  next()
}

// ─── Auth Routes ───

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: '请填写所有字段' })
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名需要2-20个字符' })
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要6个字符' })

    const exist = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username])
    if (exist.rows.length > 0) return res.status(409).json({ error: '用户名或邮箱已被注册' })

    const hash = bcrypt.hashSync(password, 10)
    const result = await query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hash]
    )
    const id = result.rows[0].id
    const token = generateToken({ id, username })
    res.json({ token, user: { id, username, email } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '注册失败' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码' })

    const result = await query('SELECT * FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    const token = generateToken(user)
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '登录失败' })
  }
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT id, username, email, created_at FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json({ user })
  } catch (e) {
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// ─── Review Routes ───

app.get('/api/reviews/:seriesId', optionalAuth, async (req, res) => {
  try {
    const reviews = await query(
      'SELECT id, series_id, user_id, username, rating, comment, created_at FROM reviews WHERE series_id = $1 ORDER BY created_at DESC',
      [req.params.seriesId]
    )
    const avg = await query(
      'SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating, COUNT(*)::int as count FROM reviews WHERE series_id = $1',
      [req.params.seriesId]
    )
    res.json({
      reviews: reviews.rows,
      avgRating: avg.rows[0]?.avg_rating || 0,
      reviewCount: avg.rows[0]?.count || 0,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取评论失败' })
  }
})

app.post('/api/reviews', authMiddleware, async (req, res) => {
  try {
    const { seriesId, rating, comment } = req.body
    if (!seriesId || !rating || !comment) return res.status(400).json({ error: '请填写评分和评论' })
    if (rating < 1 || rating > 5) return res.status(400).json({ error: '评分需要在1-5之间' })
    if (comment.length < 2) return res.status(400).json({ error: '评论至少2个字符' })

    const exist = await query('SELECT id FROM reviews WHERE series_id = $1 AND user_id = $2', [seriesId, req.user.id])
    if (exist.rows.length > 0) return res.status(409).json({ error: '你已经点评过这部剧集了' })

    const result = await query(
      'INSERT INTO reviews (series_id, user_id, username, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [seriesId, req.user.id, req.user.username, rating, comment]
    )
    res.json({ review: result.rows[0] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '发布评论失败' })
  }
})

app.put('/api/reviews/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: '点评不存在' })
    if (r.rows[0].user_id !== req.user.id) return res.status(403).json({ error: '只能修改自己的点评' })

    const { rating, comment } = req.body
    const result = await query(
      'UPDATE reviews SET rating = $1, comment = $2 WHERE id = $3 RETURNING *',
      [rating || r.rows[0].rating, comment || r.rows[0].comment, req.params.id]
    )
    res.json({ review: result.rows[0] })
  } catch (e) {
    res.status(500).json({ error: '更新失败' })
  }
})

app.delete('/api/reviews/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: '点评不存在' })
    if (r.rows[0].user_id !== req.user.id) return res.status(403).json({ error: '只能删除自己的点评' })

    await query('DELETE FROM reviews WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: '删除失败' })
  }
})

export default app
