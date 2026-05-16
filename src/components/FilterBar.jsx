export default function FilterBar({
  months,
  platforms,
  selectedPlatforms,
  selectedMonths,
  statusFilter,
  onTogglePlatform,
  onToggleMonth,
  onStatusChange,
  onClear,
}) {
  const hasFilters = selectedPlatforms.length || selectedMonths.length || statusFilter

  const formatMonth = (m) => {
    const [y, mo] = m.split('-')
    return `${y}年${parseInt(mo)}月`
  }

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label">播出平台</label>
        <div className="filter-chips">
          {platforms.map((p) => (
            <button
              key={p}
              className={`chip ${selectedPlatforms.includes(p) ? 'chip-active' : ''}`}
              onClick={() => onTogglePlatform(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">播出月份</label>
        <div className="filter-chips">
          {months.map((m) => (
            <button
              key={m}
              className={`chip ${selectedMonths.includes(m) ? 'chip-active' : ''}`}
              onClick={() => onToggleMonth(m)}
            >
              {formatMonth(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">播出状态</label>
        <div className="filter-chips">
          {[
            { value: '', label: '全部' },
            { value: 'airing', label: '播出中' },
            { value: 'completed', label: '已完结' },
            { value: 'upcoming', label: '待播出' },
          ].map(({ value, label }) => (
            <button
              key={value}
              className={`chip ${statusFilter === value ? 'chip-active' : ''}`}
              onClick={() => onStatusChange(value === statusFilter ? '' : value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <button className="clear-btn" onClick={onClear}>
          清除筛选
        </button>
      )}
    </div>
  )
}
