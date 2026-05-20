import { useState } from 'react'

export default function SeriesCard({ series }) {
  const [imgError, setImgError] = useState(false)
  const progress = Math.round((series.airedEpisodes / series.totalEpisodes) * 100)

  const statusLabels = {
    airing: '播出中',
    completed: '已完结',
    upcoming: '待播出',
  }

  const hasPoster = series.poster && !imgError

  const goDetail = () => {
    window.location.hash = `series/${series.id}`
  }

  return (
    <article className="card" onClick={goDetail}>
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
            <span className="watch-label">观看</span>
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
          </div>
        )}
      </div>
    </article>
  )
}
