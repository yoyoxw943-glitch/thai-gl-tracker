const { getDb } = require('./db.cjs')
const { authMiddleware, optionalAuth } = require('./auth.cjs')

function setupReviewRoutes(app) {
  // Get reviews for a series (public, but shows user info)
  app.get('/api/reviews/:seriesId', optionalAuth, (req, res) => {
    const db = getDb()
    const reviews = db.prepare(
      'SELECT id, series_id, user_id, username, rating, comment, created_at FROM reviews WHERE series_id = ? ORDER BY created_at DESC'
    ).all(req.params.seriesId)

    // Get average rating
    const avg = db.prepare(
      'SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as count FROM reviews WHERE series_id = ?'
    ).get(req.params.seriesId)

    res.json({ reviews, avgRating: avg.avg_rating || 0, reviewCount: avg.count })
  })

  // Create a review (auth required)
  app.post('/api/reviews', authMiddleware, (req, res) => {
    const { seriesId, rating, comment } = req.body
    if (!seriesId || !rating || !comment) {
      return res.status(400).json({ error: '请填写评分和评论' })
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: '评分需要在1-5之间' })
    }
    if (comment.length < 2) {
      return res.status(400).json({ error: '评论至少2个字符' })
    }

    const db = getDb()

    // Check if user already reviewed this series
    const existing = db.prepare('SELECT id FROM reviews WHERE series_id = ? AND user_id = ?').get(seriesId, req.user.id)
    if (existing) {
      return res.status(409).json({ error: '你已经点评过这部剧集了，可以修改之前的点评' })
    }

    const result = db.prepare(
      'INSERT INTO reviews (series_id, user_id, username, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).run(seriesId, req.user.id, req.user.username, rating, comment)

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid)
    res.json({ review })
  })

  // Update a review (auth required, owner only)
  app.put('/api/reviews/:id', authMiddleware, (req, res) => {
    const db = getDb()
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id)
    if (!review) return res.status(404).json({ error: '点评不存在' })
    if (review.user_id !== req.user.id) return res.status(403).json({ error: '只能修改自己的点评' })

    const { rating, comment } = req.body
    db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?').run(rating || review.rating, comment || review.comment, req.params.id)

    const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id)
    res.json({ review: updated })
  })

  // Delete a review (auth required, owner only)
  app.delete('/api/reviews/:id', authMiddleware, (req, res) => {
    const db = getDb()
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id)
    if (!review) return res.status(404).json({ error: '点评不存在' })
    if (review.user_id !== req.user.id) return res.status(403).json({ error: '只能删除自己的点评' })

    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  })
}

module.exports = { setupReviewRoutes }
