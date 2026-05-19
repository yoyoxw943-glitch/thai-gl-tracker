const { getDb } = require('./db.cjs')
const { authMiddleware, adminMiddleware } = require('./auth.cjs')

function setupSeriesRoutes(app) {
  // Get all series
  app.get('/api/series', (req, res) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM series ORDER BY sort_order ASC, start_date DESC').all()
    const series = rows.map(formatSeries)
    res.json({ series })
  })

  // Get single series
  app.get('/api/series/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM series WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '剧集不存在' })
    res.json({ series: formatSeries(row) })
  })

  // Create series
  app.post('/api/series', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDb()
    const {
      titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks,
    } = req.body
    if (!titleZh || !platform || !startDate) {
      return res.status(400).json({ error: '标题、平台和开播日期为必填项' })
    }

    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM series').get()
    const nextOrder = (maxOrder?.max_order ?? -1) + 1

    const result = db.prepare(`
      INSERT INTO series (title_zh, title_en, title_th, poster, platform, start_date,
        total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      titleZh, titleEn || '', titleTh || '', poster || '', platform, startDate,
      totalEpisodes || 0, airedEpisodes || 0, updateDay || '', cpName || '', synopsis || '',
      status || 'upcoming', JSON.stringify(watchLinks || []), nextOrder,
    )

    const row = db.prepare('SELECT * FROM series WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ series: formatSeries(row) })
  })

  // Update series
  app.put('/api/series/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM series WHERE id = ?').get(req.params.id)
    if (!existing) return res.status(404).json({ error: '剧集不存在' })

    const {
      titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks,
    } = req.body

    db.prepare(`
      UPDATE series SET
        title_zh = ?, title_en = ?, title_th = ?, poster = ?, platform = ?,
        start_date = ?, total_episodes = ?, aired_episodes = ?, update_day = ?,
        cp_name = ?, synopsis = ?, status = ?, watch_links = ?
      WHERE id = ?
    `).run(
      titleZh ?? existing.title_zh,
      titleEn ?? existing.title_en,
      titleTh ?? existing.title_th,
      poster ?? existing.poster,
      platform ?? existing.platform,
      startDate ?? existing.start_date,
      totalEpisodes ?? existing.total_episodes,
      airedEpisodes ?? existing.aired_episodes,
      updateDay ?? existing.update_day,
      cpName ?? existing.cp_name,
      synopsis ?? existing.synopsis,
      status ?? existing.status,
      watchLinks ? JSON.stringify(watchLinks) : existing.watch_links,
      req.params.id,
    )

    const row = db.prepare('SELECT * FROM series WHERE id = ?').get(req.params.id)
    res.json({ series: formatSeries(row) })
  })

  // Reorder series
  app.put('/api/series/:id/reorder', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDb()
    const { direction, toIndex } = req.body

    // Get all series in current display order, with id as tiebreaker for equal sort_order
    const all = db.prepare('SELECT id FROM series ORDER BY sort_order ASC, id ASC').all()
    const ids = all.map(r => r.id)
    const idx = ids.indexOf(Number(req.params.id))

    if (idx === -1) return res.status(404).json({ error: '剧集不存在' })

    let newIdx

    if (toIndex != null) {
      // Drag to specific position
      newIdx = Math.max(0, Math.min(ids.length - 1, Number(toIndex)))
      if (newIdx === idx) return res.json({ swapped: false })
      ids.splice(idx, 1)
      ids.splice(newIdx, 0, Number(req.params.id))
    } else if (direction === 'up' || direction === 'down') {
      newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= ids.length) {
        return res.json({ swapped: false, message: '已经是最前/最后位置' })
      }
      ;[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
    } else {
      return res.status(400).json({ error: '需要 direction 或 toIndex 参数' })
    }

    // Re-assign sequential sort_order to all series
    const update = db.prepare('UPDATE series SET sort_order = ? WHERE id = ?')
    const reassign = db.transaction(() => {
      for (let i = 0; i < ids.length; i++) {
        update.run(i, ids[i])
      }
    })
    reassign()

    res.json({ swapped: true })
  })

  // Delete series
  app.delete('/api/series/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM series WHERE id = ?').get(req.params.id)
    if (!existing) return res.status(404).json({ error: '剧集不存在' })

    db.prepare('DELETE FROM series WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  })

  // Cron: update aired episodes for all airing series
  app.get('/api/cron/update-aired-episodes', (req, res) => {
    const isVercelCron = req.headers['x-vercel-cron'] === '1'
    const hasSecret = process.env.CRON_SECRET && req.query.secret === process.env.CRON_SECRET
    if (!isVercelCron && !hasSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const db = getDb()
    const rows = db.prepare("SELECT * FROM series WHERE status = 'airing'").all()
    let updatedCount = 0

    for (const row of rows) {
      const computed = calcAired(row)
      if (computed !== row.aired_episodes) {
        db.prepare('UPDATE series SET aired_episodes = ? WHERE id = ?').run(computed, row.id)
        updatedCount++
      }
    }

    res.json({ success: true, updated: updatedCount, total: rows.length, timestamp: new Date().toISOString() })
  })
}

// Convert DB row to camelCase for frontend
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
    sortOrder: row.sort_order ?? 0,
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

module.exports = { setupSeriesRoutes }
