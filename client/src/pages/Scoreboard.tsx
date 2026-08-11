import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Send, Target, Trophy, X } from 'lucide-react';
import api from '../lib/api';
import type { Tender } from '../lib/types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { StageTabs } from '../components/StageTabs/StageTabs';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge, type BadgeVariant } from '../components/Badge/Badge';
import { formatCompactCurrency, formatCurrency, formatDate } from '../lib/format';

/* -----------------------------------------------------------------
 * Types + helpers
 * ----------------------------------------------------------------- */

type ScoreboardStatus = 'submitted' | 'won' | 'lost';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Parse the local date parts of a submission_deadline timestamp and
 * return {year, month} with month 1-12. We slice the ISO string and
 * split on '-' rather than going through `new Date(...).getMonth()`
 * so the bucketing is timezone-independent: a deadline of
 * 2026-09-01T00:00:00Z would otherwise land in August under a
 * negative-offset local timezone. Returns null if the string is
 * malformed or the parts are not numeric.
 */
function parseYearMonth(iso: string): { year: number; month: number } | null {
  if (typeof iso !== 'string' || iso.length < 10) return null;
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} ${String(year).slice(-2)}`;
}

function labelForKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthLabel(y, m);
}

/**
 * Every calendar month from start (inclusive) through end (inclusive)
 * in chronological order. end is extended to the current calendar
 * month if the newest deadline sits in the past, so a month with zero
 * submissions is still visible as an information gap.
 */
function monthRange(
  start: { year: number; month: number },
  end: { year: number; month: number },
): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  let ey = end.year;
  let em = end.month;
  if (currentYear > ey || (currentYear === ey && currentMonth > em)) {
    ey = currentYear;
    em = currentMonth;
  }
  const out: string[] = [];
  let y = start.year;
  let m = start.month;
  while (y < ey || (y === ey && m <= em)) {
    out.push(monthKey(y, m));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const OUTCOME_LABEL: Record<ScoreboardStatus, string> = {
  submitted: 'Awaiting',
  won: 'Won',
  lost: 'Lost',
};

const OUTCOME_VARIANT: Record<ScoreboardStatus, BadgeVariant> = {
  submitted: 'warning',
  won: 'success',
  lost: 'danger',
};

interface ScoreboardStats {
  submitted: number;
  won: number;
  lost: number;
  awaiting: number;
  decidedTotal: number;
  winRatePct: number | null;
  totalValue: number;
  wonFees: number;
}

function computeStats(rows: Tender[]): ScoreboardStats {
  let submitted = 0;
  let won = 0;
  let lost = 0;
  let awaiting = 0;
  let totalValue = 0;
  let wonFees = 0;
  for (const t of rows) {
    submitted += 1;
    totalValue += Number(t.estimated_value ?? 0);
    if (t.status === 'won') {
      won += 1;
      wonFees += Number(t.evia_fee ?? 0);
    } else if (t.status === 'lost') {
      lost += 1;
    } else if (t.status === 'submitted') {
      awaiting += 1;
    }
  }
  const decidedTotal = won + lost;
  const winRatePct = decidedTotal > 0 ? Math.round((100 * won) / decidedTotal) : null;
  return { submitted, won, lost, awaiting, decidedTotal, winRatePct, totalValue, wonFees };
}

/* -----------------------------------------------------------------
 * Row types + cell renderers
 * ----------------------------------------------------------------- */

interface MonthRow {
  key: string;
  label: string;
  stats: ScoreboardStats;
}

interface TenderRow extends Tender {
  status: ScoreboardStatus;
  submission_deadline: string;
}

function TenderNameCell({ row }: { row: TenderRow }) {
  const inner = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.title}</TruncatedText>
    </span>
  );
  return row.tender_url ? (
    <a
      href={row.tender_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="dt-link"
    >
      {inner}
    </a>
  ) : (
    inner
  );
}

function ClientNameCell({ row }: { row: TenderRow }) {
  if (!row.client_name) {
    return <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>;
  }
  const inner = <TruncatedText>{row.client_name}</TruncatedText>;
  return row.client_website ? (
    <a
      href={row.client_website}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="dt-link"
    >
      {inner}
    </a>
  ) : (
    inner
  );
}

function OutcomeCell({ row }: { row: TenderRow }) {
  return (
    <Badge variant={OUTCOME_VARIANT[row.status]} withDot>
      {OUTCOME_LABEL[row.status]}
    </Badge>
  );
}

function CurrencyOrDash({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return <>{formatCurrency(value)}</>;
}

function WinRateText({ stats }: { stats: ScoreboardStats }) {
  if (stats.winRatePct == null) {
    return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  }
  return <>{stats.winRatePct}%</>;
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function Scoreboard() {
  const toast = useToast();

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeMonth, setActiveMonth] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.get('/tenders');
      setTenders(res.data);
    } catch {
      setLoadError(true);
      toast.error('Failed to load tenders');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Filter to the population that belongs on this page: status is
   * submitted / won / lost. Info Gathering and Writing are excluded
   * everywhere, including from the month-range calculation. */
  const scored = useMemo(() => {
    return tenders.filter(
      t => t.status === 'submitted' || t.status === 'won' || t.status === 'lost',
    ) as TenderRow[];
  }, [tenders]);

  /* Partition on submission_deadline presence. Undated rows are
   * excluded from all grouping but surfaced in a small banner so the
   * gap is visible - never bucket them into a fake "Undated" tab. */
  const { dated, undatedCount } = useMemo(() => {
    const d: TenderRow[] = [];
    let u = 0;
    for (const t of scored) {
      if (t.submission_deadline && parseYearMonth(t.submission_deadline)) {
        d.push({ ...t, submission_deadline: t.submission_deadline });
      } else {
        u += 1;
      }
    }
    return { dated: d, undatedCount: u };
  }, [scored]);

  /* Bucket dated tenders by month and derive the tab range. */
  const { months, buckets } = useMemo(() => {
    const bucketMap = new Map<string, TenderRow[]>();
    let minYear = Infinity;
    let minMonth = 0;
    let maxYear = -Infinity;
    let maxMonth = 0;
    for (const t of dated) {
      const ym = parseYearMonth(t.submission_deadline)!;
      const key = monthKey(ym.year, ym.month);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.push(t);
      else bucketMap.set(key, [t]);
      if (ym.year < minYear || (ym.year === minYear && ym.month < minMonth)) {
        minYear = ym.year;
        minMonth = ym.month;
      }
      if (ym.year > maxYear || (ym.year === maxYear && ym.month > maxMonth)) {
        maxYear = ym.year;
        maxMonth = ym.month;
      }
    }
    if (dated.length === 0) {
      return { months: [] as string[], buckets: bucketMap };
    }
    const range = monthRange(
      { year: minYear, month: minMonth },
      { year: maxYear, month: maxMonth },
    );
    return { months: range, buckets: bucketMap };
  }, [dated]);

  /* Tabs: All first, then months newest to oldest. */
  const stageTabs = useMemo(() => {
    const monthTabs = [...months].reverse().map(k => ({
      key: k,
      label: labelForKey(k),
      count: buckets.get(k)?.length ?? 0,
    }));
    return [
      { key: 'all', label: 'All', count: dated.length },
      ...monthTabs,
    ];
  }, [months, buckets, dated.length]);

  /* Reset active tab if it points at a month that no longer exists
   * (e.g. after a refetch where a bucket became empty). */
  useEffect(() => {
    if (activeMonth === 'all') return;
    if (!buckets.has(activeMonth)) setActiveMonth('all');
  }, [buckets, activeMonth]);

  const activeRows: TenderRow[] = useMemo(() => {
    if (activeMonth === 'all') return dated;
    return buckets.get(activeMonth) ?? [];
  }, [activeMonth, buckets, dated]);

  const stats = useMemo(() => computeStats(activeRows), [activeRows]);

  const monthRows: MonthRow[] = useMemo(() => {
    return [...months].reverse().map(k => ({
      key: k,
      label: labelForKey(k),
      stats: computeStats(buckets.get(k) ?? []),
    }));
  }, [months, buckets]);

  const monthColumns: Column<MonthRow>[] = [
    {
      key: 'month',
      header: 'Month',
      width: 110,
      render: row => row.label,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      width: 110,
      align: 'right',
      mono: true,
      render: row => row.stats.submitted,
    },
    {
      key: 'won',
      header: 'Won',
      width: 80,
      align: 'right',
      mono: true,
      render: row => row.stats.won,
    },
    {
      key: 'lost',
      header: 'Lost',
      width: 80,
      align: 'right',
      mono: true,
      render: row => row.stats.lost,
    },
    {
      key: 'awaiting',
      header: 'Awaiting',
      width: 100,
      align: 'right',
      mono: true,
      render: row => row.stats.awaiting,
    },
    {
      key: 'win_rate',
      header: 'Win Rate',
      width: 120,
      align: 'right',
      mono: true,
      render: row => <WinRateText stats={row.stats} />,
    },
    {
      key: 'fees_won',
      header: 'Fees Won',
      width: 130,
      align: 'right',
      mono: true,
      render: row =>
        row.stats.won > 0 ? formatCurrency(row.stats.wonFees) : (
          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        ),
    },
  ];

  const tenderColumns: Column<TenderRow>[] = [
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      maxWidth: 320,
      render: row => <TenderNameCell row={row} />,
    },
    {
      key: 'client',
      header: 'Client',
      width: 160,
      maxWidth: 160,
      render: row => <ClientNameCell row={row} />,
    },
    {
      key: 'value',
      header: 'Value',
      width: 110,
      align: 'right',
      mono: true,
      render: row => <CurrencyOrDash value={row.estimated_value} />,
    },
    {
      key: 'fee',
      header: 'Fee',
      width: 100,
      align: 'right',
      mono: true,
      render: row => <CurrencyOrDash value={row.evia_fee} />,
    },
    {
      key: 'submission',
      header: 'Submission',
      width: 110,
      align: 'right',
      mono: true,
      render: row => formatDate(row.submission_deadline),
    },
    {
      key: 'award',
      header: 'Award',
      width: 110,
      align: 'right',
      mono: true,
      render: row =>
        row.award_date ? formatDate(row.award_date) : (
          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      width: 120,
      render: row => <OutcomeCell row={row} />,
    },
  ];

  const sortedTenders: TenderRow[] = useMemo(() => {
    if (activeMonth === 'all') return [];
    return [...activeRows].sort((a, b) =>
      a.submission_deadline.localeCompare(b.submission_deadline),
    );
  }, [activeRows, activeMonth]);

  const winRateHint =
    stats.decidedTotal > 0
      ? `${stats.won} of ${stats.decidedTotal} decided`
      : 'not decided';

  return (
    <>
      <PageHeader
        title="Scoreboard"
        description="Submitted tenders grouped by the calendar month of their submission deadline."
      />

      {undatedCount > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--badge-warning-bg)',
            color: 'var(--badge-warning-text)',
            border: '1px solid var(--badge-warning-dot)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          {undatedCount === 1
            ? '1 submitted tender is missing a submission deadline and is not shown. Add the deadline on Active Tenders to bring it back in.'
            : `${undatedCount} submitted tenders are missing a submission deadline and are not shown. Add the deadlines on Active Tenders to bring them back in.`}
        </div>
      )}

      <div className="kpi-row">
        <KPITile
          label="Submitted"
          value={loading ? 0 : stats.submitted}
          hint={
            !loading && stats.submitted > 0
              ? `${formatCompactCurrency(stats.totalValue)} in value`
              : undefined
          }
          icon={Send}
          tone="info"
          loading={loading}
        />
        <KPITile
          label="Won"
          value={loading ? 0 : stats.won}
          hint={
            !loading && stats.won > 0
              ? `${formatCurrency(stats.wonFees)} in fees`
              : undefined
          }
          icon={Trophy}
          tone="success"
          loading={loading}
        />
        <KPITile
          label="Lost"
          value={loading ? 0 : stats.lost}
          icon={X}
          tone="danger"
          loading={loading}
        />
        <KPITile
          label="Awaiting"
          value={loading ? 0 : stats.awaiting}
          icon={Clock}
          tone="warning"
          loading={loading}
        />
        <KPITile
          label="Win Rate"
          value={
            loading
              ? '-'
              : stats.winRatePct == null
                ? '-'
                : `${stats.winRatePct}%`
          }
          hint={loading ? undefined : winRateHint}
          icon={Target}
          tone="brand"
          loading={loading}
        />
      </div>

      <StageTabs tabs={stageTabs} activeKey={activeMonth} onChange={setActiveMonth} />

      {activeMonth === 'all' ? (
        <DataTable<MonthRow>
          columns={monthColumns}
          data={monthRows}
          rowKey={r => r.key}
          variant="attached"
          ariaLabel="Scoreboard by month"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load tenders"
          onRetry={fetchData}
          onRowClick={row => setActiveMonth(row.key)}
          emptyState={{
            message: 'No submitted tenders yet.',
          }}
        />
      ) : (
        <DataTable<TenderRow>
          columns={tenderColumns}
          data={sortedTenders}
          rowKey={r => String(r.id)}
          variant="attached"
          ariaLabel={`Scoreboard - ${labelForKey(activeMonth)}`}
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load tenders"
          onRetry={fetchData}
          emptyState={{
            message: 'No submitted tenders in this month.',
          }}
        />
      )}
    </>
  );
}
