import { useState, useEffect, useCallback, useRef } from 'react'

const API = '/api'
const EMPTY_SERIES = {
  titleZh: '', titleEn: '', titleTh: '', poster: '', platform: '',
  startDate: '', totalEpisodes: 0, airedEpisodes: 0, updateDay: '',
  cpName: '', synopsis: '', status: 'upcoming', watchLinks: [],
}

export default function AdminPage({ onClose }) {
  const [seriesList, setSeriesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = adding new, object = editing
  const [form, setForm] = useState(EMPTY_SERIES)
  const [watchLinksText, setWatchLinksText] = useState('[]')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dragIdRef = useRef(null)
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [sortBy, setSortBy] = useState('default')

  const token = () => localStorage.getItem('token')

  const fetchSeries = useCallback(async () => {
    const res = await fetch(`${API}/series`)
    const data = await res.json()
    setSeriesList(data.series)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSeries() }, [fetchSeries])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_SERIES)
    setWatchLinksText('[]')
    setError('')
    setMessage('')
  }

  const openEdit = (s) => {
    setEditing(s)
    setForm({ ...s })
    setWatchLinksText(JSON.stringify(s.watchLinks || [], null, 2))
    setError('')
    setMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!form.titleZh || !form.platform || !form.startDate) {
      setError('Title, platform and start date are required')
      return
    }
    let watchLinks
    try {
      watchLinks = JSON.parse(watchLinksText)
    } catch {
      setError('Watch links JSON format error')
      return
    }
    setSubmitting(true)

    try {
      const body = { ...form, watchLinks }
      const url = editing ? `${API}/series/${editing.id}` : `${API}/series`
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(editing ? 'Series updated' : 'Series added')
      if (!editing) {
        setForm(EMPTY_SERIES)
        setWatchLinksText('[]')
      }
      fetchSeries()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reorder = async (s, body) => {
    try {
      const res = await fetch(`${API}/series/${s.id}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.swapped) fetchSeries()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDragStart = (e, s) => {
    dragIdRef.current = s.id
    setDragId(s.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(s.id))
  }

  const handleDragOver = (e, s) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (s.id !== dragIdRef.current && dragOverId !== s.id) {
      setDragOverId(s.id)
    }
  }

  const handleDragLeave = (e) => {
    // Only clear if leaving the row, not entering a child element
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOverId(null)
  }

  const handleDrop = async (e, s) => {
    e.preventDefault()
    const fromId = dragIdRef.current
    dragIdRef.current = null
    setDragId(null)
    setDragOverId(null)
    if (fromId === s.id || fromId == null) return
    const targetIdx = seriesList.findIndex(item => item.id === s.id)
    await reorder({ id: fromId }, { toIndex: targetIdx })
  }

  const handleDragEnd = () => {
    dragIdRef.current = null
    setDragId(null)
    setDragOverId(null)
  }

  const handleDelete = async (s) => {
    if (!confirm(`Delete "${s.titleZh}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API}/series/${s.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(`Deleted "${s.titleZh}"`)
      if (editing?.id === s.id) {
        setEditing(null)
        setForm(EMPTY_SERIES)
        setWatchLinksText('[]')
      }
      fetchSeries()
    } catch (err) {
      setError(err.message)
    }
  }

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  if (loading) return <div className="admin-loading">Loading...</div>

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <div className="admin-header-actions">
          <button className="admin-btn-add" onClick={openAdd}>+ Add Series</button>
          <button className="admin-btn-close" onClick={onClose}>Back to Home</button>
        </div>
      </div>

      {message && <div className="admin-message">{message}</div>}

      {/* Add / Edit Form */}
      {(editing !== undefined || editing === null) && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h3>{editing ? `Edit: ${editing.titleZh}` : 'Add Series'}</h3>
          {error && <div className="admin-error">{error}</div>}

          <div className="admin-form-grid">
            <div className="form-group">
              <label>Chinese Title *</label>
              <input value={form.titleZh} onChange={(e) => setField('titleZh', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>English Title</label>
              <input value={form.titleEn} onChange={(e) => setField('titleEn', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Thai Title</label>
              <input value={form.titleTh} onChange={(e) => setField('titleTh', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Poster Path</label>
              <input value={form.poster} onChange={(e) => setField('poster', e.target.value)} placeholder="/posters/01.jpg" />
            </div>
            <div className="form-group">
              <label>Platform *</label>
              <input value={form.platform} onChange={(e) => setField('platform', e.target.value)} required placeholder="iQIYI / YouTube / WeTV..." />
            </div>
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Total Episodes</label>
              <input type="number" value={form.totalEpisodes} onChange={(e) => setField('totalEpisodes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Aired Episodes</label>
              <input type="number" value={form.airedEpisodes} onChange={(e) => setField('airedEpisodes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Update Day</label>
              <input value={form.updateDay} onChange={(e) => setField('updateDay', e.target.value)} placeholder="Mon / Sat..." />
            </div>
            <div className="form-group">
              <label>CP Name</label>
              <input value={form.cpName} onChange={(e) => setField('cpName', e.target.value)} placeholder="A × B" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="airing">Airing</option>
                <option value="completed">Completed</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Synopsis</label>
            <textarea value={form.synopsis} onChange={(e) => setField('synopsis', e.target.value)} rows={3} />
          </div>

          <div className="form-group">
            <label>Watch Links (JSON)</label>
            <textarea
              value={watchLinksText}
              onChange={(e) => setWatchLinksText(e.target.value)}
              rows={4}
              placeholder='[{"platform":"YouTube","url":"https://..."}]'
            />
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-submit" disabled={submitting}>
              {submitting ? 'Saving...' : editing ? 'Update Series' : 'Add Series'}
            </button>
            {(editing !== undefined || editing === null) && (
              <button type="button" className="admin-cancel" onClick={() => { setEditing(undefined); setForm(EMPTY_SERIES); setWatchLinksText('[]'); setError('') }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {/* Series List */}
      <div className="admin-list">
        <div className="admin-list-header">
          <h3>Series ({seriesList.length})</h3>
          <div className="sort-group">
            <label className="sort-label">Sort: </label>
            <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="default">Default</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Platform</th>
                <th>Start</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(sortBy === 'newest'
                ? [...seriesList].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
                : sortBy === 'oldest'
                  ? [...seriesList].sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
                  : seriesList
              ).map((s) => (
                <tr
                  key={s.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, s)}
                  onDragOver={(e) => handleDragOver(e, s)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, s)}
                  onDragEnd={handleDragEnd}
                  className={(dragOverId === s.id ? 'drag-over ' : '') + (dragId === s.id ? 'dragging' : '')}
                >
                  <td>{s.id}</td>
                  <td className="drag-handle">⠿ {s.titleZh}</td>
                  <td>{s.platform}</td>
                  <td>{s.startDate}</td>
                  <td>{s.airedEpisodes}/{s.totalEpisodes}</td>
                  <td>
                    <span className={`admin-status admin-status-${s.status}`}>
                      {{ airing: 'Airing', completed: 'Completed', upcoming: 'Upcoming' }[s.status]}
                    </span>
                  </td>
                  <td>
                    <button className="admin-order-btn" onClick={() => reorder(s, { direction: 'up' })} title="Move up">↑</button>
                    <button className="admin-order-btn" onClick={() => reorder(s, { direction: 'down' })} title="Move down">↓</button>
                  </td>
                  <td>
                    <button className="admin-edit-btn" onClick={() => openEdit(s)}>Edit</button>
                    <button className="admin-del-btn" onClick={() => handleDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
