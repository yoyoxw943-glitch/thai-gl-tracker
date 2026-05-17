import { useState, useMemo, useEffect, useCallback } from 'react'
import { filterSeries, getAvailableMonths, getAvailablePlatforms, getRecentThreeMonths } from './utils/filterSeries'
import fallbackData from './data/series.json'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import FilterBar from './components/FilterBar'
import SeriesCard from './components/SeriesCard'
import AuthModal from './components/AuthModal'
import AdminPage from './components/AdminPage'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function AppContent() {
  const { user, isAdmin, loading, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  const [selectedMonths, setSelectedMonths] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [seriesData, setSeriesData] = useState(fallbackData)
  const [showAdmin, setShowAdmin] = useState(false)

  // Fetch series from API on mount
  useEffect(() => {
    fetch('/api/series')
      .then((r) => r.json())
      .then((data) => {
        if (data.series && data.series.length > 0) {
          setSeriesData(data.series)
        }
      })
      .catch(() => {
        // Fallback to static JSON already set
      })
  }, [])

  // Hash-based routing
  const checkHash = useCallback(() => {
    setShowAdmin(window.location.hash === '#admin')
  }, [])

  useEffect(() => {
    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
  }, [checkHash])

  const months = useMemo(() => getAvailableMonths(seriesData), [seriesData])
  const platforms = useMemo(() => getAvailablePlatforms(seriesData), [seriesData])

  const filtered = useMemo(
    () => filterSeries(seriesData, { platforms: selectedPlatforms, months: selectedMonths, status: statusFilter }),
    [seriesData, selectedPlatforms, selectedMonths, statusFilter]
  )

  const recentSeries = useMemo(() => getRecentThreeMonths(seriesData), [seriesData])

  const togglePlatform = (p) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const toggleMonth = (m) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    )
  }

  const displaySeries = selectedPlatforms.length || selectedMonths.length || statusFilter
    ? filtered
    : recentSeries

  // Admin page
  if (showAdmin && isAdmin) {
    return (
      <div className="app">
        <AdminPage onClose={() => { window.location.hash = '' }} />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-header">
        <Header />
        <div className="user-area">
          {loading ? null : user ? (
            <div className="user-menu">
              <span className="user-name">{user.username}</span>
              {isAdmin && <a href="#admin" className="admin-link">管理</a>}
              <button className="user-btn" onClick={logout}>退出</button>
            </div>
          ) : (
            <button className="user-btn" onClick={() => setShowAuth(true)}>登录 / 注册</button>
          )}
        </div>
      </div>

      <FilterBar
        months={months}
        platforms={platforms}
        selectedPlatforms={selectedPlatforms}
        selectedMonths={selectedMonths}
        statusFilter={statusFilter}
        onTogglePlatform={togglePlatform}
        onToggleMonth={toggleMonth}
        onStatusChange={setStatusFilter}
        onClear={() => {
          setSelectedPlatforms([])
          setSelectedMonths([])
          setStatusFilter('')
        }}
      />

      <section className="series-info">
        <span className="series-count">共 {displaySeries.length} 部剧集</span>
        {(selectedPlatforms.length || selectedMonths.length || statusFilter) ? (
          <span className="filter-hint">（已筛选）</span>
        ) : (
          <span className="filter-hint">近3个月播出</span>
        )}
      </section>

      <div className="series-grid">
        {displaySeries.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>

      {displaySeries.length === 0 && (
        <div className="empty">没有符合条件的剧集，试试调整筛选条件</div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
