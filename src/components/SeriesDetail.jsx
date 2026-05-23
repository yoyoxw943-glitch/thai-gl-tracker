import { useState } from 'react'
import ReviewSection from './ReviewSection'

export default function SeriesDetail({ series, onClose }) {
  const [imgError, setImgError] = useState(false)
  const progress = Math.round((series.airedEpisodes / series.totalEpisodes) * 100)

  const statusLabels = {
    airing: 'Airing',
    completed: 'Completed',
    upcoming: 'Upcoming',
  }

  const hasPoster = series.poster && !imgError

  return (
    <div className="detail-page">
      <button className="detail-back" onClick={onClose}>← Back</button>

      <div className="detail-layout">
        <div className="detail-poster">
          {hasPoster ? (
            <img
              src={series.poster}
              alt={series.titleZh}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="poster-fallback detail-fallback">
              <span className="poster-fallback-text">{series.titleZh}</span>
              <span className="poster-fallback-th">{series.titleEn}</span>
            </div>
          )}
          <span className={`card-status status-${series.status}`}>
            {statusLabels[series.status]}
          </span>
        </div>

        <div className="detail-content">
          <h2 className="detail-title">{series.titleZh}</h2>
          <p className="detail-title-en">{series.titleEn}</p>
          {series.titleTh && <p className="detail-title-th">Thai: {series.titleTh}</p>}

          <div className="detail-meta">
            <span className="card-platform">{series.platform}</span>
            <span className="card-cp">{series.cpName}</span>
          </div>

          <div className="card-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">
              {series.airedEpisodes}/{series.totalEpisodes} eps
            </span>
          </div>

          {series.status === 'airing' && series.updateDay && (
            <p className="card-update">Every {series.updateDay}</p>
          )}
          {series.status === 'upcoming' && (
            <p className="card-update upcoming-text">{series.startDate}</p>
          )}
          {series.status === 'completed' && (
            <p className="card-update completed-text">Completed · {series.startDate}</p>
          )}

          <p className="detail-synopsis">{series.synopsis}</p>

          {/* Watch links — prominent */}
          {series.watchLinks && series.watchLinks.length > 0 && (
            <div className="detail-links">
              <span className="detail-links-label">Watch Links</span>
              <div className="detail-links-list">
                {series.watchLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`watch-link watch-${link.platform.toLowerCase()}`}
                  >
                    {link.platform}
                  </a>
                ))}
              </div>
            </div>
          )}

          <ReviewSection seriesId={series.id} />
        </div>
      </div>
    </div>
  )
}
