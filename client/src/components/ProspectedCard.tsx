import type { ProspectedContract } from '../lib/types'

interface Props {
  contract: ProspectedContract
  onPromote: (contract: ProspectedContract) => void
  onDelete: (contract: ProspectedContract) => void
}

function formatDate(iso: string): string {
  // Accept both "YYYY-MM-DD" and ISO datetime strings
  const dateStr = iso.slice(0, 10)
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface CountdownInfo {
  text: string
  className: string
}

function getCountdown(iso: string): CountdownInfo {
  const dateStr = iso.slice(0, 10)
  const [year, month, day] = dateStr.split('-').map(Number)
  const deadline = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = deadline.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: '(Overdue)', className: 'deadline-countdown-red' }
  }
  if (diffDays === 0) {
    return { text: '(Today)', className: 'deadline-countdown-red' }
  }
  if (diffDays < 7) {
    return { text: `(${diffDays} day${diffDays === 1 ? '' : 's'})`, className: 'deadline-countdown-red' }
  }
  if (diffDays < 14) {
    return { text: `(${diffDays} days)`, className: 'deadline-countdown-amber' }
  }
  return { text: `(${diffDays} days)`, className: 'deadline-countdown-green' }
}

export default function ProspectedCard({ contract, onPromote, onDelete }: Props) {
  const countdown = getCountdown(contract.submission_deadline)

  return (
    <div className="prospected-card">
      <div className="prospected-card-header">
        <a
          href={contract.url}
          target="_blank"
          rel="noopener noreferrer"
          className="prospected-card-title"
        >
          {contract.title}
        </a>
        <span className={contract.source === 'fts' ? 'source-badge-fts' : 'source-badge-manual'}>
          {contract.source === 'fts' ? 'FTS' : 'Manual'}
        </span>
      </div>

      <div className="prospected-deadline-row">
        <span className="prospected-label">Deadline:</span>
        <span className="prospected-deadline-date">{formatDate(contract.submission_deadline)}</span>
        <span className={countdown.className}>{countdown.text}</span>
      </div>

      <div className="prospected-meta-row">
        <span className="client-meta">
          Added by {contract.added_by_name} &middot; {formatDate(contract.created_at)}
        </span>
      </div>

      <div className="prospected-card-footer">
        <button
          className="btn-promote"
          onClick={() => onPromote(contract)}
          type="button"
        >
          Promote to Active
        </button>
        <button
          className="btn-card-delete"
          onClick={() => onDelete(contract)}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
