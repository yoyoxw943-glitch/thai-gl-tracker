import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from './db.js'
import seedData from './seed-data.js'

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

async function adminMiddleware(req, res, next) {
  try {
    const result = await query('SELECT is_admin FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: '需要管理员权限' })
    }
    next()
  } catch {
    res.status(500).json({ error: '权限验证失败' })
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

    // First user becomes admin
    const total = await query('SELECT COUNT(*)::int as count FROM users')
    const isAdmin = total.rows[0]?.count === 0

    const hash = bcrypt.hashSync(password, 10)
    const result = await query(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, email, hash, isAdmin]
    )
    const user = result.rows[0]
    const token = generateToken({ id: user.id, username: user.username })
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } })
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
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '登录失败' })
  }
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT id, username, email, is_admin, created_at FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json({ user })
  } catch (e) {
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

async function seedIfEmpty() {
  try {
    const count = await query('SELECT COUNT(*)::int as count FROM series')
    if (count.rows[0]?.count > 0) return false

    const dbType = process.env.POSTGRES_URL ? 'pg' : 'sqlite'
    for (const s of seedData) {
      if (dbType === 'pg') {
        await query(`INSERT INTO series (id, title_zh, title_en, title_th, poster, platform, start_date,
          total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
          [s.id, s.titleZh, s.titleEn, s.titleTh || '', s.poster || '', s.platform, s.startDate,
           s.totalEpisodes, s.airedEpisodes, s.updateDay || '', s.cpName || '', s.synopsis || '',
           s.status, JSON.stringify(s.watchLinks || [])])
      } else {
        await query(`INSERT OR IGNORE INTO series (id, title_zh, title_en, title_th, poster, platform, start_date,
          total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [s.id, s.titleZh, s.titleEn, s.titleTh || '', s.poster || '', s.platform, s.startDate,
           s.totalEpisodes, s.airedEpisodes, s.updateDay || '', s.cpName || '', s.synopsis || '',
           s.status, JSON.stringify(s.watchLinks || [])])
      }
    }
    return true
  } catch (e) {
    console.error('Auto-seed failed:', e.message)
    return false
  }
}

// ─── Series Routes ───

app.get('/api/series', async (req, res) => {
  try {
    await seedIfEmpty()
    const result = await query('SELECT * FROM series ORDER BY start_date DESC')
    res.json({ series: result.rows.map(formatSeries) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取剧集列表失败' })
  }
})

app.get('/api/series/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: '剧集不存在' })
    res.json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    res.status(500).json({ error: '获取剧集失败' })
  }
})

app.post('/api/series', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks } = req.body
    if (!titleZh || !platform || !startDate) {
      return res.status(400).json({ error: '标题、平台和开播日期为必填项' })
    }
    const result = await query(`
      INSERT INTO series (title_zh, title_en, title_th, poster, platform, start_date,
        total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [titleZh, titleEn || '', titleTh || '', poster || '', platform, startDate,
      totalEpisodes || 0, airedEpisodes || 0, updateDay || '', cpName || '', synopsis || '',
      status || 'upcoming', JSON.stringify(watchLinks || [])])
    res.status(201).json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '添加剧集失败' })
  }
})

app.put('/api/series/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: '剧集不存在' })
    const existing = r.rows[0]
    const { titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks } = req.body
    const result = await query(`
      UPDATE series SET title_zh=$1, title_en=$2, title_th=$3, poster=$4, platform=$5,
        start_date=$6, total_episodes=$7, aired_episodes=$8, update_day=$9,
        cp_name=$10, synopsis=$11, status=$12, watch_links=$13
      WHERE id=$14 RETURNING *
    `, [
      titleZh ?? existing.title_zh, titleEn ?? existing.title_en,
      titleTh ?? existing.title_th, poster ?? existing.poster,
      platform ?? existing.platform, startDate ?? existing.start_date,
      totalEpisodes ?? existing.total_episodes, airedEpisodes ?? existing.aired_episodes,
      updateDay ?? existing.update_day, cpName ?? existing.cp_name,
      synopsis ?? existing.synopsis, status ?? existing.status,
      watchLinks ? JSON.stringify(watchLinks) : existing.watch_links,
      req.params.id,
    ])
    res.json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '更新剧集失败' })
  }
})

app.delete('/api/series/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: '剧集不存在' })
    await query('DELETE FROM series WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: '删除剧集失败' })
  }
})

// ─── Cron Routes ───

app.get('/api/cron/update-aired-episodes', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const hasSecret = process.env.CRON_SECRET && req.query.secret === process.env.CRON_SECRET
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await query("SELECT * FROM series WHERE status = 'airing'")
    let updatedCount = 0

    for (const row of result.rows) {
      const computed = calcAired(row)
      if (computed !== row.aired_episodes) {
        await query('UPDATE series SET aired_episodes = $1 WHERE id = $2', [computed, row.id])
        updatedCount++
      }
    }

    res.json({ success: true, updated: updatedCount, total: result.rows.length, timestamp: new Date().toISOString() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Cron job failed' })
  }
})

function formatSeries(row) {
  return {
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    titleTh: row.title_th,
    poster: row.poster,
    platform: row.platform,
    startDate: row.start_date,
    totalEpisodes: row.total_episodes,
    airedEpisodes: calcAired(row),
    updateDay: row.update_day,
    cpName: row.cp_name,
    synopsis: row.synopsis,
    status: row.status,
    watchLinks: typeof row.watch_links === 'string' ? JSON.parse(row.watch_links) : row.watch_links,
    created_at: row.created_at,
  }
}

function calcAired(row) {
  if (row.status !== 'airing' || !row.start_date || !row.update_day) return row.aired_episodes
  const start = new Date(row.start_date)
  const today = new Date()
  if (today < start) return 0

  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const targetDay = dayNames.indexOf(row.update_day)
  if (targetDay === -1) return row.aired_episodes

  const firstAir = new Date(start)
  firstAir.setDate(start.getDate() + (targetDay - start.getDay() + 7) % 7)
  const diffDays = Math.floor((today - firstAir) / (1000 * 60 * 60 * 24))
  return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 0), row.total_episodes)
}

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
