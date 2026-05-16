import { useState, useMemo } from 'react'
import { filterSeries, getAvailableMonths, getAvailablePlatforms, getRecentThreeMonths } from './utils/filterSeries'
import seriesData from './data/series.json'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import FilterBar from './components/FilterBar'
import SeriesCard from './components/SeriesCard'
import AuthModal from './components/AuthModal'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function AppContent() {
  const { user, loading, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  const [selectedMonths, setSelectedMonths] = useState([])
  const [statusFilter, setStatusFilter] = useState('')

  const months = useMemo(() => getAvailableMonths(seriesData), [])
  const platforms = useMemo(() => getAvailablePlatforms(seriesData), [])

  const filtered = useMemo(
    () => filterSeries(seriesData, { platforms: selectedPlatforms, months: selectedMonths, status: statusFilter }),
    [selectedPlatforms, selectedMonths, statusFilter]
  )

  const recentSeries = useMemo(() => getRecentThreeMonths(seriesData), [])

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

  return (
    <div className="app">
      <div className="app-header">
        <Header />
        <div className="user-area">
          {loading ? null : user ? (
            <div className="user-menu">
              <span className="user-name">{user.username}</span>
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
