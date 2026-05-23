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
    return `${parseInt(mo)}/${y}`
  }

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label">Platforms</label>
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
        <label className="filter-label">Month</label>
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
        <label className="filter-label">Status</label>
        <div className="filter-chips">
          {[
            { value: '', label: 'All' },
            { value: 'airing', label: 'Airing' },
            { value: 'completed', label: 'Completed' },
            { value: 'upcoming', label: 'Upcoming' },
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
          Clear
        </button>
      )}
    </div>
  )
}
