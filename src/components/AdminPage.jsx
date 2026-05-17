import { useState, useEffect, useCallback } from 'react'

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
      setError('标题、平台和开播日期为必填项')
      return
    }
    let watchLinks
    try {
      watchLinks = JSON.parse(watchLinksText)
    } catch {
      setError('观看链接 JSON 格式错误')
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
      setMessage(editing ? '剧集已更新' : '剧集已添加')
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

  const handleDelete = async (s) => {
    if (!confirm(`确定删除《${s.titleZh}》吗？此操作不可撤销。`)) return
    try {
      const res = await fetch(`${API}/series/${s.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(`已删除《${s.titleZh}》`)
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

  if (loading) return <div className="admin-loading">加载中...</div>

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>后台管理</h2>
        <div className="admin-header-actions">
          <button className="admin-btn-add" onClick={openAdd}>+ 新增剧集</button>
          <button className="admin-btn-close" onClick={onClose}>返回主页</button>
        </div>
      </div>

      {message && <div className="admin-message">{message}</div>}

      {/* Add / Edit Form */}
      {(editing !== undefined || editing === null) && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h3>{editing ? `编辑：${editing.titleZh}` : '新增剧集'}</h3>
          {error && <div className="admin-error">{error}</div>}

          <div className="admin-form-grid">
            <div className="form-group">
              <label>中文标题 *</label>
              <input value={form.titleZh} onChange={(e) => setField('titleZh', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>英文标题</label>
              <input value={form.titleEn} onChange={(e) => setField('titleEn', e.target.value)} />
            </div>
            <div className="form-group">
              <label>泰文标题</label>
              <input value={form.titleTh} onChange={(e) => setField('titleTh', e.target.value)} />
            </div>
            <div className="form-group">
              <label>海报路径</label>
              <input value={form.poster} onChange={(e) => setField('poster', e.target.value)} placeholder="/posters/01.jpg" />
            </div>
            <div className="form-group">
              <label>播出平台 *</label>
              <input value={form.platform} onChange={(e) => setField('platform', e.target.value)} required placeholder="iQIYI / YouTube / WeTV..." />
            </div>
            <div className="form-group">
              <label>开播日期 *</label>
              <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>总集数</label>
              <input type="number" value={form.totalEpisodes} onChange={(e) => setField('totalEpisodes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>已播集数</label>
              <input type="number" value={form.airedEpisodes} onChange={(e) => setField('airedEpisodes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>更新日</label>
              <input value={form.updateDay} onChange={(e) => setField('updateDay', e.target.value)} placeholder="周一 / 周六..." />
            </div>
            <div className="form-group">
              <label>CP名</label>
              <input value={form.cpName} onChange={(e) => setField('cpName', e.target.value)} placeholder="A × B" />
            </div>
            <div className="form-group">
              <label>状态</label>
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="airing">播出中</option>
                <option value="completed">已完结</option>
                <option value="upcoming">待播出</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>剧情简介</label>
            <textarea value={form.synopsis} onChange={(e) => setField('synopsis', e.target.value)} rows={3} />
          </div>

          <div className="form-group">
            <label>观看链接 (JSON 格式)</label>
            <textarea
              value={watchLinksText}
              onChange={(e) => setWatchLinksText(e.target.value)}
              rows={4}
              placeholder='[{"platform":"YouTube","url":"https://..."}]'
            />
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-submit" disabled={submitting}>
              {submitting ? '保存中...' : editing ? '更新剧集' : '添加剧集'}
            </button>
            {(editing !== undefined || editing === null) && (
              <button type="button" className="admin-cancel" onClick={() => { setEditing(undefined); setForm(EMPTY_SERIES); setWatchLinksText('[]'); setError('') }}>
                取消
              </button>
            )}
          </div>
        </form>
      )}

      {/* Series List */}
      <div className="admin-list">
        <h3>现有剧集 ({seriesList.length})</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>平台</th>
                <th>开播</th>
                <th>进度</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {seriesList.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.titleZh}</td>
                  <td>{s.platform}</td>
                  <td>{s.startDate}</td>
                  <td>{s.airedEpisodes}/{s.totalEpisodes}</td>
                  <td>
                    <span className={`admin-status admin-status-${s.status}`}>
                      {{ airing: '播出中', completed: '已完结', upcoming: '待播出' }[s.status]}
                    </span>
                  </td>
                  <td>
                    <button className="admin-edit-btn" onClick={() => openEdit(s)}>编辑</button>
                    <button className="admin-del-btn" onClick={() => handleDelete(s)}>删除</button>
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
