// Shared utility functions for tender display logic.
// Used by the Live Pipeline table (ActiveTenders.tsx) and the Results tab cards (TenderCard.tsx).

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getDeadlineCountdown(dateString: string | null): { text: string; colorClass: string } {
  if (!dateString) return { text: '-', colorClass: '' }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dl = new Date(dateString + 'T00:00:00')
  const diffDays = Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: 'Overdue', colorClass: 'deadline-countdown-red' }
  if (diffDays === 0) return { text: 'Today', colorClass: 'deadline-countdown-red' }
  if (diffDays < 7) return { text: `${diffDays} day${diffDays === 1 ? '' : 's'}`, colorClass: 'deadline-countdown-red' }
  if (diffDays < 14) return { text: `${diffDays} days`, colorClass: 'deadline-countdown-amber' }
  return { text: `${diffDays} days`, colorClass: 'deadline-countdown-green' }
}

export function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return '\u00a3' + Math.round(amount).toLocaleString('en-GB')
}

export function calculateEviaFee(amount: number | null): string {
  if (!amount) return '-'
  const fee = Math.max(amount * 0.03, 2000)
  return '\u00a3' + Math.round(fee).toLocaleString('en-GB')
}

const STATUS_LABELS_MAP: Record<string, string> = {
  questionnaire_sent: 'Questionnaire Sent',
  writing: 'Writing',
  submitted: 'Submitted / Awaiting Result',
  won: 'Won',
  lost: 'Lost',
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS_MAP[status] ?? status
}

export function getStatusColor(status: string): string {
  return `status-${status}`
}

export function getNextAdvanceAction(
  status: string
): { label: string; nextStatus: string } | { labels: string[]; nextStatuses: string[] } | null {
  if (status === 'submitted') {
    return { labels: ['Mark Won', 'Mark Lost'], nextStatuses: ['won', 'lost'] }
  }
  const nextMap: Record<string, string> = {
    questionnaire_sent: 'writing',
    writing: 'submitted',
  }
  const labelMap: Record<string, string> = {
    questionnaire_sent: 'Move to Writing',
    writing: 'Move to Submitted',
  }
  if (nextMap[status]) {
    return { label: labelMap[status], nextStatus: nextMap[status] }
  }
  return null
}
