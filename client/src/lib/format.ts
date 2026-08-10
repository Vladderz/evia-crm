/* Formatting helpers - all UI date and currency rendering goes through here. */

const LONDON_TZ = 'Europe/London';

const SHORT_MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Returns the calendar day in Europe/London as { year, month, day },
 * with month 1-12. Robust to DST.
 */
function londonParts(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Standard date format used everywhere: "27 Mar 26".
 * Returns empty string for null/invalid input - callers render `-` themselves
 * if they need a placeholder.
 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const { year, month, day } = londonParts(d);
  return `${day} ${SHORT_MONTH[month - 1]} ${String(year).slice(-2)}`;
}

/**
 * Currency in GBP. No decimals at >=£100, decimals shown under £100.
 * Negative values render with a leading minus inside the currency.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  const showDecimals = Math.abs(value) < 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value);
}

/**
 * Compact currency for cramped KPI tiles: values at or above 1,000,000
 * render as "£15.2M" (1 dp, trailing .0 trimmed). Below 1M we defer to
 * the normal formatCurrency, so tiles stay legible at both scales.
 * Only intended for tiles where the value can plausibly exceed 7 digits;
 * use formatCurrency everywhere else so table rows and detail views
 * stay consistent.
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = millions.toFixed(1).replace(/\.0$/, '');
    return `£${formatted}M`;
  }
  return formatCurrency(value);
}

export type RelativeDaysTone = 'overdue' | 'urgent' | null;

export interface RelativeDays {
  /** Whole days from today. Negative = past, positive = future. */
  days: number;
  /** Pre-formatted chip label, e.g. "9 days overdue" or "9 days". null = no chip. */
  label: string | null;
  /** "overdue" (danger), "urgent" (warning, <14 days future), or null. */
  tone: RelativeDaysTone;
}

/**
 * Calendar-day delta in Europe/London between target date and today.
 * Used to drive the inline overdue/countdown chips next to dates in tables.
 *
 * Rules from the brief:
 *   - past target  -> tone "overdue", label "N days overdue"
 *   - 0..13 days   -> tone "urgent",  label "N days" (or "Today" / "Tomorrow")
 *   - 14+ days     -> tone null, label null (no chip)
 */
export function formatRelativeDays(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): RelativeDays | null {
  const target = toDate(value);
  if (!target) return null;

  const t = londonParts(target);
  const r = londonParts(now);
  const targetUtc = Date.UTC(t.year, t.month - 1, t.day);
  const refUtc = Date.UTC(r.year, r.month - 1, r.day);
  const days = Math.round((targetUtc - refUtc) / 86_400_000);

  if (days < 0) {
    const n = Math.abs(days);
    return {
      days,
      label: n === 1 ? '1 day overdue' : `${n} days overdue`,
      tone: 'overdue',
    };
  }
  if (days < 14) {
    let label: string;
    if (days === 0) label = 'Today';
    else if (days === 1) label = 'Tomorrow';
    else label = `${days} days`;
    return { days, label, tone: 'urgent' };
  }
  return { days, label: null, tone: null };
}

/* ------------------------------------------------------------------
 * Status labels
 * ------------------------------------------------------------------
 * Translates Tender enum values (snake_case in DB) to display labels.
 * Pipeline statuses are stored as display strings already and pass
 * through unchanged.
 *
 * getStatusLabel returns the short form used in badges and most UI
 * surfaces. getStatusLabelLong returns the verbose form for detail
 * views (per brief: "Submitted / Awaiting Result" only in detail).
 */
export const TENDER_STATUS_LABELS: Record<string, string> = {
  questionnaire_sent: 'Info Gathering',
  writing: 'Writing',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};

export const TENDER_STATUS_LABELS_LONG: Record<string, string> = {
  questionnaire_sent: 'Info Gathering',
  writing: 'Writing',
  submitted: 'Submitted / Awaiting Result',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};

export const TENDER_STATUS_OPTIONS = [
  { value: 'questionnaire_sent', label: TENDER_STATUS_LABELS.questionnaire_sent! },
  { value: 'writing',            label: TENDER_STATUS_LABELS.writing! },
  { value: 'submitted',          label: TENDER_STATUS_LABELS.submitted! },
  { value: 'won',                label: TENDER_STATUS_LABELS.won! },
  { value: 'lost',               label: TENDER_STATUS_LABELS.lost! },
  { value: 'archived',           label: TENDER_STATUS_LABELS.archived! },
];

export function getStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  return TENDER_STATUS_LABELS[status] ?? status;
}

export function getStatusLabelLong(status: string | null | undefined): string {
  if (!status) return '';
  return TENDER_STATUS_LABELS_LONG[status] ?? status;
}

/* ------------------------------------------------------------------
 * Prospect (Sales Pipeline) status labels
 * ------------------------------------------------------------------ */

export const PROSPECT_STATUS_LABELS: Record<string, string> = {
  contacted:    'Contacted',
  call_booked:  'Call Booked',
  waiting_room: 'Waiting Room',
};

export const PROSPECT_STATUS_OPTIONS = [
  { value: 'contacted',    label: PROSPECT_STATUS_LABELS.contacted! },
  { value: 'call_booked',  label: PROSPECT_STATUS_LABELS.call_booked! },
  { value: 'waiting_room', label: PROSPECT_STATUS_LABELS.waiting_room! },
];

export function getProspectStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  return PROSPECT_STATUS_LABELS[status] ?? status;
}

/* ------------------------------------------------------------------
 * Drop reason labels
 * ------------------------------------------------------------------ */

const DROP_REASON_LABELS: Record<string, string> = {
  not_interested:  'Not interested in this tender',
  went_with_other: 'Went with another bid writer',
  price_concern:   'Price / fee concern',
  ghosted:         'Ghosted / no response',
  timing:          'Timing wrong',
  other:           'Other',
};

export const DROP_REASON_OPTIONS = [
  { value: 'not_interested',  label: DROP_REASON_LABELS.not_interested! },
  { value: 'went_with_other', label: DROP_REASON_LABELS.went_with_other! },
  { value: 'price_concern',   label: DROP_REASON_LABELS.price_concern! },
  { value: 'ghosted',         label: DROP_REASON_LABELS.ghosted! },
  { value: 'timing',          label: DROP_REASON_LABELS.timing! },
  { value: 'other',           label: DROP_REASON_LABELS.other! },
];

export function getDropReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  return DROP_REASON_LABELS[reason] ?? reason;
}
