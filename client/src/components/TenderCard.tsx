import type { Tender } from '../lib/types'
import { formatDate, getStatusLabel } from '../lib/tenderUtils'

interface Props {
  tender: Tender
  view: 'live' | 'results'
  onEdit: (tender: Tender) => void
  onDelete: (tender: Tender) => void
  onAdvance: (tender: Tender, newStatus: string) => void
}

const NEXT_STATUS: Record<string, string> = {
  questionnaire_sent: 'writing',
  writing: 'submitted',
}

const NEXT_STATUS_LABEL: Record<string, string> = {
  questionnaire_sent: 'Move to Writing',
  writing: 'Move to Submitted',
}

interface DeadlineInfo {
  label: string
  color: string
  bold: boolean
  borderClass: string
}

function getDeadlineInfo(deadline: string | null): DeadlineInfo {
  if (!deadline) {
    return { label: '(No deadline)', color: '#9CA3AF', bold: false, borderClass: 'tender-border-grey' }
  }
  const now = new Date()
  const dl = new Date(deadline)
  const diffMs = dl.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { label: '(Overdue)', color: '#EF4444', bold: true, borderClass: 'tender-border-red' }
  }
  if (diffDays === 0) {
    return { label: '(Due today)', color: '#EF4444', bold: true, borderClass: 'tender-border-red' }
  }
  if (diffDays <= 3) {
    return { label: `(${diffDays} day${diffDays === 1 ? '' : 's'} left)`, color: '#EF4444', bold: true, borderClass: 'tender-border-red' }
  }
  if (diffDays <= 7) {
    return { label: `(${diffDays} days left)`, color: '#F59E0B', bold: false, borderClass: 'tender-border-amber' }
  }
  return { label: `(${diffDays} days left)`, color: '#22C55E', bold: false, borderClass: 'tender-border-green' }
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}


function formatCurrency(value: number | null | undefined): string {
  if (!value) return 'Value: TBC'
  return '£' + Math.round(value).toLocaleString('en-GB')
}

function formatFee(value: number | null | undefined): string {
  if (!value) return ''
  return 'Fee: £' + Math.round(value).toLocaleString('en-GB')
}

export default function TenderCard({ tender, view, onEdit, onDelete, onAdvance }: Props) {
  const deadlineInfo = getDeadlineInfo(tender.submission_deadline)

  const borderClass = view === 'results'
    ? (tender.status === 'won' ? 'tender-border-won' : 'tender-border-lost')
    : deadlineInfo.borderClass

  const portalRef = [
    tender.portal,
    tender.reference_number ? `Ref: ${tender.reference_number}` : null,
  ].filter(Boolean).join(' - ')

  return (
    <div className={`tender-card ${borderClass}`}>

      {/* Header: title + status badge */}
      <div className="tender-card-header">
        <div className="tender-card-title">
          {tender.tender_url ? (
            <a href={tender.tender_url} target="_blank" rel="noopener noreferrer">
              {tender.title}
            </a>
          ) : (
            tender.title
          )}
        </div>
        <span className={`status-badge status-${tender.status}`}>
          {getStatusLabel(tender.status)}
        </span>
      </div>

      {/* Deadline - Live Pipeline only */}
      {view === 'live' && (
        <div className="tender-deadline">
          {tender.submission_deadline ? (
            <>
              <span className="tender-deadline-date">
                {formatDeadline(tender.submission_deadline)}
              </span>
              <span
                className={`deadline-countdown${deadlineInfo.bold ? ' urgent' : ''}`}
                style={{ color: deadlineInfo.color }}
              >
                {deadlineInfo.label}
              </span>
            </>
          ) : (
            <span className="deadline-countdown" style={{ color: '#9CA3AF' }}>
              (No deadline)
            </span>
          )}
        </div>
      )}

      {/* Buyer */}
      {tender.buyer && <p className="tender-buyer">{tender.buyer}</p>}

      {/* Portal / Reference */}
      {portalRef && <p className="tender-portal-ref">{portalRef}</p>}

      {/* Value row - Results view shows more prominently */}
      {view === 'results' ? (
        <div>
          <div className="tender-results-value">{formatCurrency(tender.estimated_value)}</div>
          {tender.evia_fee ? (
            <div className="tender-results-fee">{formatFee(tender.evia_fee)}</div>
          ) : null}
        </div>
      ) : (
        <div className="tender-value-row">
          <span className="tender-value">{formatCurrency(tender.estimated_value)}</span>
          {tender.evia_fee ? (
            <span className="tender-fee">{formatFee(tender.evia_fee)}</span>
          ) : null}
        </div>
      )}

      {/* Client */}
      {tender.client_name ? (
        <p className="tender-client">Client: {tender.client_name}</p>
      ) : (
        <p className="tender-client-none">No client linked</p>
      )}

      {/* Assigned */}
      {tender.assigned_to && (
        <div>
          <span className="tender-assigned-pill">{tender.assigned_to}</span>
        </div>
      )}

      {/* Notes - truncated to 1 line */}
      {tender.notes && <p className="tender-notes">{tender.notes}</p>}

      {/* Quick advance buttons - Live Pipeline only */}
      {view === 'live' && tender.status === 'submitted' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-advance"
            onClick={() => onAdvance(tender, 'won')}
            type="button"
          >
            Mark Won
          </button>
          <button
            className="btn-advance"
            onClick={() => onAdvance(tender, 'lost')}
            type="button"
          >
            Mark Lost
          </button>
        </div>
      )}
      {view === 'live' && NEXT_STATUS[tender.status] && (
        <div>
          <button
            className="btn-advance"
            onClick={() => onAdvance(tender, NEXT_STATUS[tender.status])}
            type="button"
          >
            {NEXT_STATUS_LABEL[tender.status]}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="tender-card-footer">
        <span className="tender-meta">
          {tender.created_by_name ? `Added by ${tender.created_by_name}` : 'Added'} - {formatDate(tender.created_at)}
        </span>
        <div className="tender-card-actions">
          <button className="btn-card-edit" onClick={() => onEdit(tender)}>Edit</button>
          <button className="btn-card-delete" onClick={() => onDelete(tender)}>Delete</button>
        </div>
      </div>
    </div>
  )
}
