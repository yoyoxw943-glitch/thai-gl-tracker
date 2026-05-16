export function filterSeries(series, { platforms, months, status }) {
  return series.filter((s) => {
    if (platforms.length > 0 && !platforms.includes(s.platform)) return false
    if (months.length > 0) {
      const d = new Date(s.startDate)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!months.includes(m)) return false
    }
    if (status && s.status !== status) return false
    return true
  })
}

export function getAvailableMonths(series) {
  const months = new Set()
  series.forEach((s) => {
    const d = new Date(s.startDate)
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  })
  return [...months].sort().reverse()
}

export function getAvailablePlatforms(series) {
  return [...new Set(series.map((s) => s.platform))].sort()
}

export function getRecentThreeMonths(series) {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
  return series.filter((s) => {
    const d = new Date(s.startDate)
    return d >= threeMonthsAgo
  })
}
