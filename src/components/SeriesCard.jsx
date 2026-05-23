import { useState } from 'react'

export default function SeriesCard({ series }) {
  const [imgError, setImgError] = useState(false)

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
        <div className="card-meta">
          <span className="card-cp">{series.cpName}</span>
        </div>
      </div>
    </article>
  )
}
