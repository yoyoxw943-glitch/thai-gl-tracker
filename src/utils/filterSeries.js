export function filterSeries(series, { platforms, months, status }) {
  return series.filter((s) => {
    if (platforms.length > 0) {
      const sPlatforms = [...s.platform.split(' / '), ...(s.watchLinks || []).map((l) => l.platform)]
      if (!platforms.some((p) => sPlatforms.includes(p))) return false
    }
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
  const platforms = new Set()
  series.forEach((s) => {
    // Split combined platforms like "GMMTV / YouTube" into individual ones
    s.platform.split(' / ').forEach((p) => platforms.add(p))
    if (s.watchLinks) {
      s.watchLinks.forEach((l) => platforms.add(l.platform))
    }
  })
  platforms.delete('')
  return [...platforms].sort()
}

export function getRecentThreeMonths(series) {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
  return series.filter((s) => {
    const d = new Date(s.startDate)
    return d >= threeMonthsAgo
  })
}
