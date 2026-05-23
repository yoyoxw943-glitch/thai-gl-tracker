import { useState, useMemo, useEffect, useCallback } from 'react'
import { filterSeries, getAvailableMonths, getAvailablePlatforms } from './utils/filterSeries'
import fallbackData from './data/series.json'
import { AuthProvider, useAuth } from './context/AuthContext'
import { usePolling } from './utils/usePolling'
import Header from './components/Header'
import FilterBar from './components/FilterBar'
import SeriesCard from './components/SeriesCard'
import AuthModal from './components/AuthModal'
import AdminPage from './components/AdminPage'
import SeriesDetail from './components/SeriesDetail'
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
  const [sortBy, setSortBy] = useState('default')
  const [seriesData, setSeriesData] = useState(fallbackData)
  const [showAdmin, setShowAdmin] = useState(false)
  const [detailSeries, setDetailSeries] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchSeriesData = useCallback(() => {
    setRefreshing(true)
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
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    fetchSeriesData()
  }, [fetchSeriesData])

  usePolling(fetchSeriesData, 300000)

  // Hash-based routing
  const checkHash = useCallback(() => {
    const hash = window.location.hash
    if (hash === '#admin') {
      setShowAdmin(true)
      setDetailSeries(null)
    } else if (hash.startsWith('#series/')) {
      const id = parseInt(hash.slice('#series/'.length), 10)
      const found = seriesData.find((s) => s.id === id)
      setDetailSeries(found || null)
      setShowAdmin(false)
    } else {
      setShowAdmin(false)
      setDetailSeries(null)
    }
  }, [seriesData])

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

  const displaySeries = useMemo(() => {
    if (sortBy === 'newest') {
      return [...filtered].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
    }
    if (sortBy === 'oldest') {
      return [...filtered].sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    }
    return filtered
  }, [filtered, sortBy])

  // Admin page
  if (showAdmin && isAdmin) {
    return (
      <div className="app">
        <AdminPage onClose={() => { window.location.hash = '' }} />
      </div>
    )
  }

  // Series detail page
  if (detailSeries) {
    return (
      <div className="app">
        <SeriesDetail
          series={detailSeries}
          onClose={() => { window.location.hash = '' }}
        />
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
              {isAdmin && <a href="#admin" className="admin-link">Admin</a>}
              <button className="user-btn" onClick={logout}>Logout</button>
            </div>
          ) : (
            <button className="user-btn" onClick={() => setShowAuth(true)}>Login / Register</button>
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
        <span className="series-count">{displaySeries.length} series{refreshing && <span className="refresh-indicator" title="Refreshing..."> &#x27F3;</span>}</span>
        {(selectedPlatforms.length || selectedMonths.length || statusFilter) ? (
          <span className="filter-hint">(filtered)</span>
        ) : (
          <span className="filter-hint">All series</span>
        )}
        <div className="sort-group">
          <label className="sort-label">Sort: </label>
          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="default">Default</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </section>

      <div className="series-grid">
        {displaySeries.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>

      {displaySeries.length === 0 && (
        <div className="empty">No matching series. Try adjusting filters.</div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
