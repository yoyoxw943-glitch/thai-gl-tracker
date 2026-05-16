import { useState } from 'react'
import ReviewSection from './ReviewSection'

export default function SeriesCard({ series }) {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const progress = Math.round((series.airedEpisodes / series.totalEpisodes) * 100)

  const statusLabels = {
    airing: '播出中',
    completed: '已完结',
    upcoming: '待播出',
  }

  const hasPoster = series.poster && !imgError

  return (
    <article
      className={`card ${expanded ? 'card-expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="card-poster">
        {hasPoster ? (
          <img
            src={series.poster}
            alt={series.titleZh}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="poster-fallback">
            <span className="poster-fallback-text">{series.titleZh}</span>
            <span className="poster-fallback-th">{series.titleEn}</span>
          </div>
        )}
        <span className={`card-status status-${series.status}`}>
          {statusLabels[series.status]}
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{series.titleZh}</h3>
        <p className="card-title-en">{series.titleEn}</p>
        <div className="card-meta">
          <span className="card-platform">{series.platform}</span>
          <span className="card-cp">{series.cpName}</span>
        </div>
        <div className="card-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">
            {series.airedEpisodes}/{series.totalEpisodes} 集
          </span>
        </div>
        {series.status === 'airing' && series.updateDay && (
          <p className="card-update">每周{series.updateDay}更新</p>
        )}
        {series.status === 'upcoming' && (
          <p className="card-update upcoming-text">{series.startDate} 开播</p>
        )}
        {series.status === 'completed' && (
          <p className="card-update completed-text">已完结</p>
        )}

        {/* Watch links */}
        {series.watchLinks && series.watchLinks.length > 0 && (
          <div className="card-links">
            {series.watchLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`watch-link watch-${link.platform.toLowerCase()}`}
                onClick={(e) => e.stopPropagation()}
              >
                {link.platform}
              </a>
            ))}
            <span className="watch-hint">点击跳转观看</span>
          </div>
        )}

        {expanded && (
          <div className="card-detail">
            <p className="card-synopsis">{series.synopsis}</p>
            <p className="card-date">
              播出时间：{series.startDate}
              {series.status === 'completed' && ' — 已完结'}
              {series.status === 'airing' && ' — 播出中'}
            </p>
            {series.titleTh && <p className="card-thai">泰语名：{series.titleTh}</p>}

            {/* Reviews */}
            <ReviewSection seriesId={series.id} />
          </div>
        )}
      </div>
    </article>
  )
}
