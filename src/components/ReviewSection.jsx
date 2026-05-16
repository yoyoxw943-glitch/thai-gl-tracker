import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const API = '/api'

export default function ReviewSection({ seriesId }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [avgRating, setAvgRating] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Review form
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)

  const myReview = reviews.find((r) => r.user_id === user?.id)

  const fetchReviews = useCallback(async () => {
    const headers = {}
    const token = localStorage.getItem('token')
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${API}/reviews/${seriesId}`, { headers })
    const data = await res.json()
    setReviews(data.reviews)
    setAvgRating(data.avgRating)
    setReviewCount(data.reviewCount)
    setLoading(false)
  }, [seriesId])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!myRating) { setError('请选择评分'); return }
    if (!myComment.trim()) { setError('请填写评论'); return }
    setError('')
    setSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      if (editingId) {
        await fetch(`${API}/reviews/${editingId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ rating: myRating, comment: myComment }),
        })
      } else {
        await fetch(`${API}/reviews`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ seriesId, rating: myRating, comment: myComment }),
        })
      }

      setMyRating(0)
      setMyComment('')
      setEditingId(null)
      fetchReviews()
    } catch (err) {
      setError('提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (review) => {
    setMyRating(review.rating)
    setMyComment(review.comment)
    setEditingId(review.id)
  }

  const handleDelete = async (reviewId) => {
    if (!confirm('确定删除这条点评吗？')) return
    const token = localStorage.getItem('token')
    await fetch(`${API}/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchReviews()
  }

  if (loading) return <div className="review-loading">加载评论...</div>

  return (
    <div className="review-section" onClick={(e) => e.stopPropagation()}>
      <div className="review-header">
        <h4 className="review-title">观众点评</h4>
        {reviewCount > 0 && (
          <span className="review-avg">
            ★ {avgRating} <span className="review-count">({reviewCount}条)</span>
          </span>
        )}
      </div>

      {/* Review form for logged-in users */}
      {user && !myReview && (
        <form className="review-form" onSubmit={handleSubmit}>
          <div className="review-rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star-btn ${n <= myRating ? 'star-active' : ''}`}
                onClick={() => setMyRating(n)}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={myComment}
            onChange={(e) => setMyComment(e.target.value)}
            placeholder="写下你对这部剧的看法..."
            rows={3}
            required
          />
          {error && <p className="review-error">{error}</p>}
          <button type="submit" className="review-submit" disabled={submitting}>
            {editingId ? '更新点评' : '发布点评'}
          </button>
        </form>
      )}

      {/* Edit form */}
      {user && myReview && editingId && (
        <form className="review-form" onSubmit={handleSubmit}>
          <div className="review-rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star-btn ${n <= myRating ? 'star-active' : ''}`}
                onClick={() => setMyRating(n)}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={myComment}
            onChange={(e) => setMyComment(e.target.value)}
            rows={3}
            required
          />
          {error && <p className="review-error">{error}</p>}
          <div className="review-form-actions">
            <button type="submit" className="review-submit" disabled={submitting}>更新</button>
            <button type="button" className="review-cancel" onClick={() => { setEditingId(null); setMyRating(0); setMyComment('') }}>取消</button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <p className="review-empty">暂无点评，{user ? '成为第一个点评的人吧！' : '登录后即可点评'}</p>
      ) : (
        <div className="review-list">
          {reviews.map((r) => (
            <div key={r.id} className={`review-item ${r.user_id === user?.id ? 'review-mine' : ''}`}>
              <div className="review-item-header">
                <span className="review-user">{r.username}</span>
                <span className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <span className="review-date">{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
              <p className="review-comment">{r.comment}</p>
              {r.user_id === user?.id && (
                <div className="review-actions">
                  <button onClick={() => handleEdit(r)}>编辑</button>
                  <button onClick={() => handleDelete(r.id)}>删除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
