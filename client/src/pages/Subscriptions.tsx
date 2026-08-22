import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import {
  siAnthropic,
  siGithub,
  siGoogle,
  siRailway,
} from 'simple-icons';
import api from '../lib/api';
import type {
  Subscription,
  SubscriptionCategory,
  SubscriptionOwner,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { FilterBar } from '../components/FilterBar/FilterBar';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Select } from '../components/Select/Select';
import {
  SubscriptionDrawer,
  type SubscriptionFormValues,
} from '../components/SubscriptionDrawer/SubscriptionDrawer';
import ConfirmDialog from '../components/ConfirmDialog';

/* -----------------------------------------------------------------
 * Constants + helpers
 * ----------------------------------------------------------------- */

const OWNER_ORDER: SubscriptionOwner[] = ['evia_consultancy', 'vlad', 'tristan'];

const OWNER_LABEL: Record<SubscriptionOwner, string> = {
  evia_consultancy: 'Evia Consultancy',
  vlad:             'Vlad Lewis',
  tristan:          'Tristan Walker',
};

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatGbp(value: number): string {
  return GBP.format(value);
}

/* "3 Sep 2026" from a yyyy-mm-dd string, without going through
 * new Date(iso) - keeps the calendar day regardless of local TZ. */
function formatRenewalDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/* Whole-day delta between a yyyy-mm-dd string and today, using local
 * date parts on both sides. Deliberately does not pass the ISO string
 * to new Date(...) so the value is not shifted by the browser's TZ. */
function daysUntil(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function relativeLabel(ymd: string): string {
  const n = daysUntil(ymd);
  if (n < 0) return n === -1 ? '1 day ago' : `${Math.abs(n)} days ago`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
}

function cycleBadgeLabel(cycle: Subscription['billing_cycle']): string | null {
  if (cycle === 'quarterly') return 'Quarterly';
  if (cycle === 'annual') return 'Annual';
  return null;
}

/* -----------------------------------------------------------------
 * Brand icon lookup
 * -----------------------------------------------------------------
 * simple-icons exports each brand as { title, hex, path }. We render
 * the path as an inline 16px SVG tinted with the brand hex. Match is
 * case-insensitive on service_name so the lookup survives renames
 * and the two Google Workspace variants ('Google Workspace - Evia' /
 * '- Vlad' etc).
 *
 * Each entry is looked up defensively: if a future simple-icons
 * release drops one of these exports the import lands as undefined
 * and we quietly fall back to the letter tile rather than crashing
 * the whole table.
 */
type SimpleIcon = { title: string; hex: string; path: string };
type BrandEntry = { match: string; icon: SimpleIcon | undefined };

const BRAND_ENTRIES: BrandEntry[] = [
  { match: 'google workspace', icon: siGoogle    as SimpleIcon | undefined },
  { match: 'github',           icon: siGithub    as SimpleIcon | undefined },
  { match: 'railway',          icon: siRailway   as SimpleIcon | undefined },
  { match: 'claude',           icon: siAnthropic as SimpleIcon | undefined },
];

function findBrandIcon(serviceName: string): SimpleIcon | null {
  const q = serviceName.toLowerCase();
  for (const entry of BRAND_ENTRIES) {
    if (entry.icon && q.includes(entry.match)) return entry.icon;
  }
  return null;
}

function BrandIcon({ serviceName }: { serviceName: string }) {
  const icon = findBrandIcon(serviceName);
  if (icon) {
    return (
      <svg
        role="img"
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        style={{ flexShrink: 0, display: 'block' }}
        fill={`#${icon.hex}`}
      >
        <path d={icon.path} />
      </svg>
    );
  }
  const letter = (serviceName.trim().charAt(0) || '?').toUpperCase();
  return (
    <span className="brand-icon-fallback" aria-hidden="true">
      {letter}
    </span>
  );
}

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

/* All three stacked cells set align-items explicitly. text-align on
 * the td does not reach flex children, so any cell that wraps content
 * in a flex container has to pin its own cross-axis alignment to
 * match the column. Service, Cost and Renewal are all left-aligned
 * columns, so all three pin to flex-start. */

function ServiceCell({ row }: { row: Subscription }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
        minWidth: 0,
      }}
    >
      <BrandIcon serviceName={row.service_name} />
      <div
        className="dt-cell-2line"
        style={{ alignItems: 'flex-start', minWidth: 0 }}
      >
        <span className="dt-cell-primary">
          <TruncatedText>{row.service_name}</TruncatedText>
        </span>
        {row.account_email && (
          <span className="dt-cell-secondary">{row.account_email}</span>
        )}
      </div>
    </div>
  );
}

function CostCell({ row }: { row: Subscription }) {
  const cycleLabel = cycleBadgeLabel(row.billing_cycle);
  return (
    <div className="dt-cell-2line" style={{ alignItems: 'flex-start' }}>
      <span>{formatGbp(row.amount)}</span>
      {cycleLabel && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 2,
          }}
        >
          <Badge variant="neutral" size="sm">{cycleLabel}</Badge>
          <span className="dt-cell-secondary">
            {formatGbp(row.monthly_equivalent)}/month
          </span>
        </span>
      )}
    </div>
  );
}

function RenewalCell({ row }: { row: Subscription }) {
  const days = daysUntil(row.next_renewal_date);
  const urgent = days <= 7;
  const dateText = formatRenewalDate(row.next_renewal_date);
  const rel = relativeLabel(row.next_renewal_date);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
      }}
    >
      {urgent ? (
        <Badge variant="warning" size="sm">{dateText}</Badge>
      ) : (
        <span>{dateText}</span>
      )}
      <span className="dt-cell-secondary">{rel}</span>
    </div>
  );
}

function LinkCell({ row }: { row: Subscription }) {
  if (!row.management_url) return null;
  return (
    <a
      href={row.management_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="dt-link"
      aria-label={`Open ${row.service_name} billing page`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <ExternalLink size={14} aria-hidden />
    </a>
  );
}

function ActionsCell({
  row,
  onEdit,
  onDelete,
}: {
  row: Subscription;
  onEdit: (row: Subscription) => void;
  onDelete: (row: Subscription) => void;
}) {
  return (
    <span
      className="dt-actions"
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', gap: 6 }}
    >
      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(row)}>
        Edit
      </Button>
      <button
        type="button"
        className="dt-icon-danger"
        aria-label="Delete subscription"
        onClick={() => onDelete(row)}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </span>
  );
}

/* -----------------------------------------------------------------
 * Server <-> form mapping
 * ----------------------------------------------------------------- */

function toForm(row: Subscription): Partial<SubscriptionFormValues> {
  return {
    service_name: row.service_name,
    owner: row.owner,
    amount: String(row.amount),
    billing_cycle: row.billing_cycle,
    renewal_anchor_date: row.renewal_anchor_date,
    payment_method: row.payment_method,
    category: (row.category ?? '') as SubscriptionCategory | '',
    management_url: row.management_url ?? '',
    account_email: row.account_email ?? '',
    status: row.status,
    notes: row.notes ?? '',
  };
}

function toPayload(values: SubscriptionFormValues): Record<string, unknown> {
  return {
    service_name: values.service_name.trim(),
    owner: values.owner,
    amount: parseFloat(values.amount),
    billing_cycle: values.billing_cycle,
    renewal_anchor_date: values.renewal_anchor_date,
    payment_method: values.payment_method.trim() || 'Tide Business',
    category: values.category === '' ? null : values.category,
    management_url: values.management_url.trim() || null,
    account_email: values.account_email.trim() || null,
    status: values.status,
    notes: values.notes.trim() || null,
  };
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

type StatusFilter = 'active' | 'all';

export default function Subscriptions() {
  const toast = useToast();

  const [rows, setRows] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [drawerInitial, setDrawerInitial] = useState<
    Partial<SubscriptionFormValues> | null | undefined
  >(undefined);
  const [editingId, setEditingId] = useState<number | null>(null);
  const drawerOpen = drawerInitial !== undefined;

  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.get<Subscription[]>('/subscriptions');
      setRows(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* KPI totals: only active rows contribute. Paused and cancelled
   * subscriptions are excluded regardless of the table filter. */
  const kpis = useMemo(() => {
    const totals: Record<SubscriptionOwner | 'all', number> = {
      all: 0,
      evia_consultancy: 0,
      vlad: 0,
      tristan: 0,
    };
    for (const r of rows) {
      if (r.status !== 'active') continue;
      totals.all += r.monthly_equivalent;
      totals[r.owner] += r.monthly_equivalent;
    }
    return totals;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter === 'active' && r.status !== 'active') return false;
      if (q && !r.service_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, debouncedSearch, statusFilter]);

  const grouped = useMemo(() => {
    const g: Record<SubscriptionOwner, Subscription[]> = {
      evia_consultancy: [],
      vlad: [],
      tristan: [],
    };
    for (const r of filtered) g[r.owner].push(r);
    for (const owner of OWNER_ORDER) {
      g[owner].sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date));
    }
    return g;
  }, [filtered]);

  /* Subtotals reflect the current filter (so paused rows disappear
   * from the group header sum when the toggle is on Active only).
   * Active rows always match the KPI totals; the "all" toggle can
   * make them larger. */
  const groupSubtotals = useMemo(() => {
    const s: Record<SubscriptionOwner, number> = {
      evia_consultancy: 0,
      vlad: 0,
      tristan: 0,
    };
    for (const owner of OWNER_ORDER) {
      for (const r of grouped[owner]) s[owner] += r.monthly_equivalent;
    }
    return s;
  }, [grouped]);

  /* ------------- Handlers ------------- */

  function openAdd() {
    setEditingId(null);
    setDrawerInitial(null);
  }

  function openEdit(row: Subscription) {
    setEditingId(row.id);
    setDrawerInitial(toForm(row));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingId(null);
  }

  async function handleSave(values: SubscriptionFormValues) {
    const payload = toPayload(values);
    try {
      if (editingId !== null) {
        const res = await api.put<Subscription>(`/subscriptions/${editingId}`, payload);
        // Optimistic: swap the updated row in place. Server returns the
        // full decorated row (including next_renewal_date and
        // monthly_equivalent), so no follow-up fetch is needed.
        setRows(prev => prev.map(r => (r.id === editingId ? res.data : r)));
        toast.success('Subscription updated');
      } else {
        const res = await api.post<Subscription>('/subscriptions', payload);
        setRows(prev => [...prev, res.data]);
        toast.success('Subscription added');
      }
      closeDrawer();
    } catch {
      toast.error(
        editingId !== null
          ? 'Failed to update subscription. Please try again.'
          : 'Failed to add subscription. Please try again.',
      );
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await api.delete(`/subscriptions/${target.id}`);
      setRows(prev => prev.filter(r => r.id !== target.id));
      toast.success(`${target.service_name} deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete subscription. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  /* The Link column is hidden until at least one visible row has a
   * management_url, at which point it appears and Service gives back
   * the 9% width it borrowed. Computed from the current filter so a
   * saved URL surfaces the column immediately. */
  const showLinkColumn = useMemo(
    () => filtered.some(r => !!r.management_url && r.management_url.trim() !== ''),
    [filtered],
  );

  /* Widths pack Service / Cost / Renewal together on the left and let
   * Actions hold the right edge. Cost and Renewal are left-aligned so
   * their values sit next to Service instead of drifting to the right
   * of an empty gap. Both configurations sum to exactly 100%. */
  const columns: Column<Subscription>[] = [
    {
      key: 'service',
      header: 'Service',
      width: showLinkColumn ? '26%' : '28%',
      align: 'left',
      render: row => <ServiceCell row={row} />,
    },
    {
      key: 'cost',
      header: 'Cost',
      width: '12%',
      align: 'left',
      mono: true,
      render: row => <CostCell row={row} />,
    },
    {
      key: 'renewal',
      header: 'Next Renewal',
      width: '20%',
      align: 'left',
      mono: true,
      render: row => <RenewalCell row={row} />,
    },
    ...(showLinkColumn
      ? [{
          key: 'link',
          header: 'Link',
          width: '8%',
          align: 'left' as const,
          render: (row: Subscription) => <LinkCell row={row} />,
        }]
      : []),
    {
      key: 'actions',
      header: '',
      width: showLinkColumn ? '34%' : '40%',
      align: 'right',
      render: row => (
        <ActionsCell row={row} onEdit={openEdit} onDelete={setDeleteTarget} />
      ),
    },
  ];

  const noResults = !loading && !loadError && filtered.length === 0;
  const emptyMessage =
    rows.length === 0
      ? 'No subscriptions yet. Add your first one to get started.'
      : 'No subscriptions match these filters.';

  const iconByOwner: Record<SubscriptionOwner, typeof Building2> = {
    evia_consultancy: Building2,
    vlad: User,
    tristan: User,
  };
  const toneByOwner: Record<SubscriptionOwner, 'brand' | 'info' | 'success'> = {
    evia_consultancy: 'brand',
    vlad: 'info',
    tristan: 'success',
  };

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Recurring software costs across Evia Consultancy and the founders."
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add Subscription
          </Button>
        }
      />

      <div className="kpi-row">
        <KPITile
          label="Total Monthly"
          value={loading ? '£0.00' : formatGbp(kpis.all)}
          icon={Wallet}
          tone="brand"
          mono
          loading={loading}
        />
        {OWNER_ORDER.map(owner => (
          <KPITile
            key={owner}
            label={OWNER_LABEL[owner]}
            value={loading ? '£0.00' : formatGbp(kpis[owner])}
            icon={iconByOwner[owner]}
            tone={toneByOwner[owner]}
            mono
            loading={loading}
          />
        ))}
      </div>

      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search services..."
        />
        <Select
          value={statusFilter}
          onValueChange={v => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'active', label: 'Active only' },
            { value: 'all',    label: 'Include paused / cancelled' },
          ]}
          width={220}
          ariaLabel="Filter by status"
        />
      </FilterBar>

      {loading || loadError || noResults ? (
        <DataTable<Subscription>
          columns={columns}
          data={[]}
          rowKey={r => String(r.id)}
          ariaLabel="Subscriptions"
          layout="fixed"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load subscriptions"
          onRetry={fetchData}
          emptyState={{ message: emptyMessage }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {OWNER_ORDER.map(owner => {
            const groupRows = grouped[owner];
            if (groupRows.length === 0) return null;
            return (
              <section key={owner}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 4px 8px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary-v1)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <CalendarClock size={14} aria-hidden />
                  <span>{OWNER_LABEL[owner]}</span>
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-secondary-v1)',
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    ({formatGbp(groupSubtotals[owner])}/month)
                  </span>
                </div>
                <DataTable<Subscription>
                  columns={columns}
                  data={groupRows}
                  rowKey={r => String(r.id)}
                  ariaLabel={`${OWNER_LABEL[owner]} subscriptions`}
                  layout="fixed"
                />
              </section>
            );
          })}
        </div>
      )}

      <SubscriptionDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Subscription"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.service_name}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
