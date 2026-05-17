const { getDb } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const seriesPath = path.join(__dirname, '..', 'src', 'data', 'series.json')
const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'))

const db = getDb()

const insert = db.prepare(`
  INSERT OR IGNORE INTO series (id, title_zh, title_en, title_th, poster, platform, start_date,
    total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertMany = db.transaction((series) => {
  for (const s of series) {
    insert.run(
      s.id,
      s.titleZh,
      s.titleEn,
      s.titleTh || '',
      s.poster || '',
      s.platform,
      s.startDate,
      s.totalEpisodes,
      s.airedEpisodes,
      s.updateDay || '',
      s.cpName || '',
      s.synopsis || '',
      s.status,
      JSON.stringify(s.watchLinks || []),
    )
  }
})

insertMany(seriesData)
console.log(`Seeded ${seriesData.length} series into database.`)
