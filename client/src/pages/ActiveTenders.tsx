import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  Layers,
  Pencil,
  PenLine,
  Plus,
  Send,
  StickyNote,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import api from '../lib/api';
import type { Client, Tender, DropReason, ProcurementType } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { StageTabs } from '../components/StageTabs/StageTabs';
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl';
import { FilterBar } from '../components/FilterBar/FilterBar';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge, type BadgeVariant } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Avatar } from '../components/Avatar/Avatar';
import { Select } from '../components/Select/Select';
import {
  TenderDrawer,
  type TenderClientOption,
  type TenderFormValues,
  type TenderStatus,
} from '../components/TenderDrawer/TenderDrawer';
import { DropDialog } from '../components/DropDialog/DropDialog';
import { MarkLostDialog } from '../components/MarkLostDialog/MarkLostDialog';
import { AwaitingInfoDialog } from '../components/AwaitingInfoDialog/AwaitingInfoDialog';
import NotesPanel from '../components/NotesPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
  tenderStatusOptions,
  tenderViewOf,
  type TenderView,
} from '../lib/format';

/* -----------------------------------------------------------------
 * Status -> Badge mapping
 * ----------------------------------------------------------------- */

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  writing: 'warning',
  submitted: 'info',
  questionnaire_sent: 'neutral',
  won: 'success',
  lost: 'danger',
  archived: 'neutral',
};

const STATUS_HAS_DOT: Record<string, boolean> = {
  writing: true,
  submitted: true,
  questionnaire_sent: true,
  won: false,
  lost: false,
  archived: false,
};

// Stage-tab keys are stable across views; only the labels change with
// the procurement type of the current view (Won / Lost read Admitted /
// Not Admitted while DPS is selected). Archived is not type-aware.
function buildStageTabs(view: TenderView): { key: string; label: string }[] {
  const typeForLabels: ProcurementType = view === 'dps' ? 'dps' : 'tender';
  return [
    { key: 'all', label: 'All' },
    ...tenderStatusOptions(typeForLabels).map(o => ({ key: o.value, label: o.label })),
    // Recovery route for legacy rows the old auto-archive job stranded.
    // Nothing new lands here now, but the tab must exist so those rows
    // are reachable. Excluded from All and from all KPI totals.
    { key: 'archived', label: 'Archived' },
  ];
}

/* -----------------------------------------------------------------
 * Cycling pipeline tile
 * ----------------------------------------------------------------- */

type PipelineTileState = 'total' | 'active' | 'submitted';

const PIPELINE_TILE_KEY = 'evia.activeTenders.pipelineTile';

const PIPELINE_STATE_ORDER: PipelineTileState[] = ['total', 'active', 'submitted'];

const PIPELINE_TILE_META: Record<
  PipelineTileState,
  { label: string; icon: typeof Layers }
> = {
  total:     { label: 'Total Pipeline',           icon: Layers },
  active:    { label: 'Info Gathering + Writing', icon: PenLine },
  submitted: { label: 'Submitted',                icon: Send },
};

/* -----------------------------------------------------------------
 * Map server Tender shape to TenderDrawer's form values
 * ----------------------------------------------------------------- */

function tenderToForm(t: Tender): Partial<TenderFormValues> {
  return {
    title: t.title,
    tender_url: t.tender_url ?? '',
    buyer: t.buyer ?? '',
    estimated_value: t.estimated_value != null ? String(t.estimated_value) : '',
    evia_fee: t.evia_fee != null ? String(Math.round(t.evia_fee)) : '',
    submission_deadline: t.submission_deadline ? t.submission_deadline.slice(0, 16) : '',
    award_date: t.award_date ? t.award_date.slice(0, 10) : '',
    portal: t.portal ?? '',
    reference_number: t.reference_number ?? '',
    sector: t.sector ?? '',
    client_id: t.client_id != null ? String(t.client_id) : '',
    status: t.status as TenderStatus,
    // Fallback is display-only. When Edit mode saves, handleSave omits
    // procurement_type from the payload if the loaded value is missing
    // so a record whose type failed to load can never be overwritten.
    procurement_type: t.procurement_type ?? 'tender',
    awaiting_info: t.awaiting_info ?? false,
    awaiting_info_note: t.awaiting_info_note ?? '',
    assigned_to: t.assigned_to ?? '',
    notes: t.notes ?? '',
  };
}

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function TenderCell({ row, view }: { row: Tender; view: TenderView }) {
  const titleSpan = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.title}</TruncatedText>
    </span>
  );
  const showFrameworkBadge = view === 'tenders' && row.procurement_type === 'framework';
  return (
    <div className="dt-cell-2line">
      {row.tender_url ? (
        <a
          href={row.tender_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="dt-link"
        >
          {titleSpan}
        </a>
      ) : (
        titleSpan
      )}
      {(row.reference_number || showFrameworkBadge) && (
        <span
          className="dt-cell-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {row.reference_number}
          {showFrameworkBadge && (
            <Badge variant="neutral" size="sm">Framework</Badge>
          )}
        </span>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: Tender }) {
  const showAwaiting =
    (row.status === 'writing' || row.status === 'questionnaire_sent') &&
    row.awaiting_info === true;
  const awaitingTooltip = row.awaiting_info_note?.trim() || 'Chasing client for info';
  // is_stale is server-computed and only ever true for status==='submitted'.
  // Row stays where it is; the badge is the whole surfacing mechanism.
  const showChase = row.status === 'submitted' && row.is_stale === true;
  return (
    <div className="status-stack">
      <Badge variant={STATUS_VARIANT[row.status]} withDot={STATUS_HAS_DOT[row.status]}>
        {tenderStatusLabel(row.status, row.procurement_type)}
      </Badge>
      {showAwaiting && (
        <span title={awaitingTooltip}>
          <Badge variant="warning" withDot>Chasing</Badge>
        </span>
      )}
      {showChase && (
        <span title="Submitted more than 90 days ago with no result recorded - chase the buyer">
          <Badge variant="warning" withDot>Chase</Badge>
        </span>
      )}
    </div>
  );
}

function ValueCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return <>{formatCurrency(value)}</>;
}

function AwardCell({ row }: { row: Tender }) {
  if (!row.award_date) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  const rel = formatRelativeDays(row.award_date);
  if (!rel?.tone) {
    return <span style={{ whiteSpace: 'nowrap' }}>{formatDate(row.award_date)}</span>;
  }
  return (
    <div className="dt-date-2line">
      <span>{formatDate(row.award_date)}</span>
      <span className={`dt-date-suffix dt-date-suffix-${rel.tone}`}>{rel.label}</span>
    </div>
  );
}

function SubmissionCell({ row }: { row: Tender }) {
  if (!row.submission_deadline) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return <>{formatDate(row.submission_deadline)}</>;
}

function AssignedCell({ row }: { row: Tender }) {
  if (!row.assigned_to) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <span style={{ display: 'inline-flex' }}>
          <Avatar name={row.assigned_to} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="dt-tooltip" sideOffset={4} collisionPadding={8}>
          {row.assigned_to}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface ActionsCellProps {
  row: Tender;
  onEdit: (t: Tender) => void;
  onNotes: (t: Tender) => void;
  onAdvance: (t: Tender, status: string) => void;
  onMarkLost: (t: Tender) => void;
  onToggleAwaiting: (t: Tender) => void;
  onDrop: (t: Tender) => void;
}

/* Stage transitions are one-click. Mark Won stays one-click. Mark
 * Lost opens a small confirm dialog with an optional reason note -
 * it's terminal and worth the friction. Edit and Notes are always
 * available. Drop is always available. The funnel is
 * Info Gathering -> Writing -> Submitted; the buttons mirror
 * that direction (forward = ArrowRight, backward = ArrowLeft).
 * DPS records read Admitted / Not Admitted in place of Won / Lost. */
function ActionsCell({ row, onEdit, onNotes, onAdvance, onMarkLost, onToggleAwaiting, onDrop }: ActionsCellProps) {
  const inActiveStage = row.status === 'questionnaire_sent' || row.status === 'writing';
  const awaitingOn = inActiveStage && row.awaiting_info === true;
  const isDps = row.procurement_type === 'dps';
  const markWonLabel = isDps ? 'Mark Admitted' : 'Mark Won';
  const markLostLabel = isDps ? 'Mark Not Admitted' : 'Mark Lost';
  return (
    <span
      className="dt-actions"
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', gap: 6 }}
    >
      <Button variant="ghost" size="sm" icon={StickyNote} onClick={() => onNotes(row)}>
        Notes
      </Button>
      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(row)}>
        Edit
      </Button>

      {inActiveStage && (
        <Button
          variant="ghost"
          size="sm"
          icon={Clock}
          className={awaitingOn ? 'btn-chasing-active' : undefined}
          title={awaitingOn ? 'Clear chasing status' : 'Mark this tender as chasing client for info'}
          onClick={() => onToggleAwaiting(row)}
        >
          {awaitingOn ? 'Clear Chasing' : 'Mark Chasing'}
        </Button>
      )}

      {row.status === 'questionnaire_sent' && (
        <>
          <Button variant="ghost" size="sm" icon={ArrowRight} onClick={() => onAdvance(row, 'writing')}>
            Move to Writing
          </Button>
          <Button variant="ghost" size="sm" icon={Send} onClick={() => onAdvance(row, 'submitted')}>
            Mark Submitted
          </Button>
        </>
      )}
      {row.status === 'writing' && (
        <>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => onAdvance(row, 'questionnaire_sent')}>
            Back to Info Gathering
          </Button>
          <Button variant="ghost" size="sm" icon={Send} onClick={() => onAdvance(row, 'submitted')}>
            Mark Submitted
          </Button>
        </>
      )}
      {row.status === 'submitted' && (
        <>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => onAdvance(row, 'writing')}>
            Back to Writing
          </Button>
          <Button variant="primary" size="sm" icon={Check} onClick={() => onAdvance(row, 'won')}>
            {markWonLabel}
          </Button>
          <Button variant="danger" size="sm" icon={X} onClick={() => onMarkLost(row)}>
            {markLostLabel}
          </Button>
        </>
      )}

      <Button variant="danger" size="sm" onClick={() => onDrop(row)}>
        Drop
      </Button>
    </span>
  );
}

/* -----------------------------------------------------------------
 * Expand panel
 * ----------------------------------------------------------------- */

function ExpandPanel({
  row,
  onEdit,
  onNotes,
  onAdvance,
}: {
  row: Tender;
  onEdit: (t: Tender) => void;
  onNotes: (t: Tender) => void;
  onAdvance: (t: Tender, status: string) => void;
}) {
  const markWonLabel = row.procurement_type === 'dps' ? 'Mark Admitted' : 'Mark Won';
  const advanceTarget: { label: string; status: string } | null =
    row.status === 'questionnaire_sent'
      ? { label: 'Move to Writing', status: 'writing' }
      : row.status === 'writing'
        ? { label: 'Move to Submitted', status: 'submitted' }
        : row.status === 'submitted'
          ? { label: markWonLabel, status: 'won' }
          : null;

  return (
    <div className="dt-expand-grid">
      <div>
        <div className="dt-expand-section-title">Latest note</div>
        {row.latest_note_text ? (
          <div className="dt-expand-note" style={{ borderBottom: 'none' }}>
            <div className="dt-expand-note-meta">
              {row.latest_note_date && formatDate(row.latest_note_date)}
            </div>
            {row.latest_note_text}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            No notes yet.
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="dt-action dt-action-link"
            onClick={() => onNotes(row)}
          >
            View all notes
          </button>
        </div>
      </div>

      <div>
        <div className="dt-expand-section-title">Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          {row.buyer && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Buyer: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.buyer}</span>
            </div>
          )}
          {row.portal && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Portal: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.portal}</span>
            </div>
          )}
          {row.sector && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Sector: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.sector}</span>
            </div>
          )}
          {row.client_name && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Client: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.client_name}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="dt-expand-section-title">Quick Actions</div>
        <div className="dt-expand-actions">
          {advanceTarget && (
            <Button
              variant="primary"
              size="sm"
              icon={advanceTarget.status === 'won' ? Check : Send}
              onClick={() => onAdvance(row, advanceTarget.status)}
            >
              {advanceTarget.label}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(row)}>
            Edit tender
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={StickyNote}
            onClick={() => onNotes(row)}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function ActiveTenders() {
  const { user } = useAuth();
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const view: TenderView = searchParams.get('type') === 'dps' ? 'dps' : 'tenders';
  const isDpsView = view === 'dps';

  const [tenders, setTenders] = useState<Tender[]>([]);
  // Fetched separately from /tenders?view=archived. The default list
  // deliberately excludes archived, so KPI totals derived from `tenders`
  // stay accurate. Only the Archived tab reads this array.
  const [archivedTenders, setArchivedTenders] = useState<Tender[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /* Filters */
  const [stage, setStage] = useState<string>('questionnaire_sent');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function switchView(nextView: TenderView) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (nextView === 'dps') params.set('type', 'dps');
      else params.delete('type');
      return params;
    }, { replace: true });
    setExpandedId(null);
  }

  /* Drawer */
  const [drawerInitial, setDrawerInitial] = useState<
    Partial<TenderFormValues> | null | undefined
  >(undefined);
  const [editingTenderId, setEditingTenderId] = useState<number | null>(null);
  // The record's procurement_type at load time. undefined = server did
  // not return one (or we are in Add mode). handleSave uses this so an
  // unloaded type can never be silently overwritten.
  const [editingLoadedType, setEditingLoadedType] = useState<Tender['procurement_type'] | undefined>(undefined);
  const drawerOpen = drawerInitial !== undefined;

  /* Notes panel + delete + drop */
  const [notesPanelTender, setNotesPanelTender] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tender | null>(null);
  const [dropTarget, setDropTarget] = useState<Tender | null>(null);
  const [markLostTarget, setMarkLostTarget] = useState<Tender | null>(null);
  const [awaitingInfoTarget, setAwaitingInfoTarget] = useState<Tender | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [tendersRes, clientsRes, archivedRes] = await Promise.all([
        api.get('/tenders'),
        api.get('/clients'),
        api.get('/tenders?view=archived'),
      ]);
      setTenders(tendersRes.data);
      setArchivedTenders(archivedRes.data);
      setClients(
        (clientsRes.data as Client[]).sort((a, b) =>
          a.company_name.localeCompare(b.company_name),
        ),
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Everything on the page derives from these two scoped lists rather
   * than the raw fetches. tenderViewOf falls back to 'tenders' for any
   * row missing a procurement_type, so a stale record can never be
   * hidden from both views at once. */
  const scopedTenders = useMemo(
    () => tenders.filter(t => tenderViewOf(t.procurement_type) === view),
    [tenders, view],
  );
  const scopedArchived = useMemo(
    () => archivedTenders.filter(t => tenderViewOf(t.procurement_type) === view),
    [archivedTenders, view],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: 0,
      writing: 0,
      questionnaire_sent: 0,
      submitted: 0,
      won: 0,
      lost: 0,
      archived: scopedArchived.length,
    };
    for (const t of scopedTenders) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (t.status !== 'won' && t.status !== 'lost' && t.status !== 'archived') {
        c.all = (c.all ?? 0) + 1;
      }
    }
    return c;
  }, [scopedTenders, scopedArchived]);

  const stats = useMemo(() => {
    const won = scopedTenders.filter(t => t.status === 'won');
    const lost = scopedTenders.filter(t => t.status === 'lost');
    const decided = won.length + lost.length;
    return {
      active: counts.all ?? 0,
      wonValue: won.reduce((s, t) => s + Number(t.estimated_value ?? 0), 0),
      wonFees: won.reduce((s, t) => s + Number(t.evia_fee ?? 0), 0),
      wonCount: won.length,
      decided,
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
    };
  }, [scopedTenders, counts]);

  /* Cycling pipeline tile: three views on the same funnel, driven by
   * clicks on the tile itself. State persists so page reloads keep the
   * user on whichever view they left it. /tenders already excludes
   * dropped + archived rows, so we don't re-filter for those. */
  const pipelineValues = useMemo(() => {
    const sumFor = (statuses: TenderStatus[]) => {
      const rows = scopedTenders.filter(t => statuses.includes(t.status as TenderStatus));
      return {
        value: rows.reduce((s, t) => s + Number(t.estimated_value ?? 0), 0),
        fees:  rows.reduce((s, t) => s + Number(t.evia_fee ?? 0), 0),
      };
    };
    return {
      total:     sumFor(['questionnaire_sent', 'writing', 'submitted']),
      active:    sumFor(['questionnaire_sent', 'writing']),
      submitted: sumFor(['submitted']),
    };
  }, [scopedTenders]);

  /* Active counts per view - the only figure that reads the unscoped
   * tenders list, needed to label the view switch at the top of the
   * page. Both counts come from the same iteration to keep them in
   * sync. */
  const viewSwitchCounts = useMemo(() => {
    const active: Record<TenderView, number> = { tenders: 0, dps: 0 };
    for (const t of tenders) {
      if (t.status === 'questionnaire_sent' || t.status === 'writing' || t.status === 'submitted') {
        active[tenderViewOf(t.procurement_type)] += 1;
      }
    }
    return active;
  }, [tenders]);

  const [pipelineState, setPipelineState] = useState<PipelineTileState>(() => {
    if (typeof window === 'undefined') return 'total';
    const stored = window.localStorage.getItem(PIPELINE_TILE_KEY);
    return PIPELINE_STATE_ORDER.includes(stored as PipelineTileState)
      ? (stored as PipelineTileState)
      : 'total';
  });

  useEffect(() => {
    window.localStorage.setItem(PIPELINE_TILE_KEY, pipelineState);
  }, [pipelineState]);

  const nextPipelineState =
    PIPELINE_STATE_ORDER[
      (PIPELINE_STATE_ORDER.indexOf(pipelineState) + 1) % PIPELINE_STATE_ORDER.length
    ];
  const cyclePipelineState = () => setPipelineState(nextPipelineState);
  const pipelineMeta = PIPELINE_TILE_META[pipelineState];
  const pipelineFigures = pipelineValues[pipelineState];

  /* Applies the stage / assignee / search filters to a source list.
   * Extracted so the same predicate can be applied to the other view's
   * lists when the cross-view search hint counts matches. */
  const applyRowFilters = useCallback(
    (source: Tender[]): Tender[] => {
      const q = debouncedSearch.trim().toLowerCase();
      return source.filter(t => {
        if (stage === 'all') {
          if (t.status === 'won' || t.status === 'lost' || t.status === 'archived') {
            return false;
          }
        } else if (stage === 'archived') {
          // source is already status='archived' server-side; no extra check.
        } else if (t.status !== stage) {
          return false;
        }
        if (assigned && t.assigned_to !== assigned) return false;
        if (q) {
          const hay = `${t.title} ${t.client_name ?? ''} ${t.reference_number ?? ''} ${t.buyer ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    [stage, debouncedSearch, assigned],
  );

  const filtered = useMemo(() => {
    const source = stage === 'archived' ? scopedArchived : scopedTenders;
    return applyRowFilters(source);
  }, [scopedTenders, scopedArchived, stage, applyRowFilters]);

  /* Rows in the other view that would pass the current filters - used
   * when a search is active and this view is empty. Same predicate,
   * same stage tab, same assignee. */
  const otherViewMatches = useMemo(() => {
    if (!debouncedSearch.trim()) return 0;
    if (filtered.length > 0) return 0;
    const otherView: TenderView = view === 'dps' ? 'tenders' : 'dps';
    const otherTenders = tenders.filter(t => tenderViewOf(t.procurement_type) === otherView);
    const otherArchived = archivedTenders.filter(t => tenderViewOf(t.procurement_type) === otherView);
    const source = stage === 'archived' ? otherArchived : otherTenders;
    return applyRowFilters(source).length;
  }, [view, tenders, archivedTenders, stage, debouncedSearch, filtered.length, applyRowFilters]);

  const tabsWithCount = buildStageTabs(view).map(t => ({ ...t, count: counts[t.key] ?? 0 }));

  /* ------------- Handlers ------------- */

  function clearFilters() {
    setSearch('');
    setAssigned(undefined);
  }

  function toggleExpand(row: Tender) {
    const id = String(row.id);
    setExpandedId(curr => (curr === id ? null : id));
  }

  function openAdd() {
    setEditingTenderId(null);
    setEditingLoadedType(undefined);
    setDrawerInitial(null);
  }

  function openEdit(t: Tender) {
    setEditingTenderId(t.id);
    setEditingLoadedType(t.procurement_type);
    setDrawerInitial(tenderToForm(t));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingTenderId(null);
    setEditingLoadedType(undefined);
  }

  function openNotes(t: { id: number; title: string }) {
    setNotesPanelTender({ id: t.id, title: t.title });
  }

  async function handleAdvance(t: Tender, newStatus: string) {
    try {
      await api.put(`/tenders/${t.id}`, { status: newStatus });
      const label = tenderStatusLabel(newStatus, t.procurement_type);
      toast.success(`Moved to ${label}`);
      fetchData();
    } catch {
      toast.error('Failed to update status. Please try again.');
    }
  }

  async function handleSave(values: TenderFormValues) {
    const payload: Record<string, unknown> = {
      client_id: values.client_id ? parseInt(values.client_id, 10) : null,
      title: values.title.trim(),
      buyer: values.buyer || null,
      estimated_value: values.estimated_value ? parseFloat(values.estimated_value) : null,
      evia_fee: values.evia_fee ? parseFloat(values.evia_fee) : null,
      submission_deadline: values.submission_deadline || null,
      award_date: values.award_date || null,
      portal: values.portal || null,
      reference_number: values.reference_number || null,
      sector: values.sector || null,
      tender_url: values.tender_url || null,
      status: values.status,
      assigned_to: values.assigned_to || null,
      notes: values.notes || null,
      awaiting_info: values.awaiting_info,
      awaiting_info_note: values.awaiting_info_note || null,
    };
    // Add mode always sends procurement_type. Edit mode only sends it
    // when we actually changed it, so a record whose type failed to
    // load (editingLoadedType === undefined) cannot be overwritten.
    if (editingTenderId === null) {
      payload.procurement_type = values.procurement_type;
    } else if (
      editingLoadedType !== undefined
      && values.procurement_type !== editingLoadedType
    ) {
      payload.procurement_type = values.procurement_type;
    }
    const newView = tenderViewOf(values.procurement_type);
    const loadedView = editingLoadedType !== undefined ? tenderViewOf(editingLoadedType) : undefined;
    const viewLabel = (v: TenderView) => v === 'dps' ? 'DPS' : 'Tenders and Frameworks';
    try {
      if (editingTenderId !== null) {
        await api.put(`/tenders/${editingTenderId}`, payload);
        if (loadedView !== undefined && loadedView !== newView) {
          toast.success(`Moved to ${viewLabel(newView)}`);
        } else {
          toast.success('Tender updated');
        }
      } else {
        await api.post('/tenders', payload);
        if (newView !== view) {
          toast.success(`Added to ${viewLabel(newView)}`);
        } else {
          toast.success('Tender added');
        }
      }
      closeDrawer();
      fetchData();
    } catch {
      toast.error(
        editingTenderId !== null
          ? 'Failed to update tender. Please try again.'
          : 'Failed to add tender. Please try again.',
      );
    }
  }

  function handleToggleAwaiting(t: Tender) {
    if (t.awaiting_info === true) {
      // One-click clear - no dialog.
      void api
        .put(`/tenders/${t.id}`, { awaiting_info: false, awaiting_info_note: null })
        .then(() => {
          toast.success(`${t.title} - awaiting info cleared`);
          fetchData();
        })
        .catch(() => {
          toast.error('Failed to clear awaiting info. Please try again.');
        });
    } else {
      // Open the dialog to capture the required note.
      setAwaitingInfoTarget(t);
    }
  }

  async function handleAwaitingInfoConfirm({ note }: { note: string }) {
    if (!awaitingInfoTarget) return;
    const target = awaitingInfoTarget;
    try {
      await api.put(`/tenders/${target.id}`, {
        awaiting_info: true,
        awaiting_info_note: note,
      });
      toast.success(`${target.title} marked as awaiting info`);
      setAwaitingInfoTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to mark awaiting info. Please try again.');
    }
  }

  async function handleMarkLostConfirm({ lossNote }: { lossNote: string }) {
    if (!markLostTarget) return;
    const target = markLostTarget;
    const outcomeLabel = tenderStatusLabel('lost', target.procurement_type);
    try {
      await api.put(`/tenders/${target.id}`, {
        status: 'lost',
        loss_note: lossNote || null,
      });
      toast.success(`${target.title} marked as ${outcomeLabel}`);
      setMarkLostTarget(null);
      fetchData();
    } catch {
      toast.error(`Failed to mark as ${outcomeLabel}. Please try again.`);
    }
  }

  async function handleDropConfirm({ reason, note }: { reason: DropReason; note: string }) {
    if (!dropTarget) return;
    const target = dropTarget;
    try {
      await api.post(`/tenders/${target.id}/drop`, { reason, note });
      toast.success(`${target.title} moved to No Man's Land`);
      setDropTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to drop tender. Please try again.');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const title = deleteTarget.title;
    try {
      await api.delete(`/tenders/${deleteTarget.id}`);
      toast.success(`${title} deleted`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete tender. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  const filtersActive = !!search || !!assigned;
  const clientOptions: TenderClientOption[] = clients.map(c => ({
    id: c.id,
    name: c.company_name,
  }));

  const tenderColumn: Column<Tender> = {
    key: 'tender',
    header: 'Tender',
    width: 'flex',
    // In the DPS view the Value column is hidden. Widen the Tender
    // cap by the same 100px so the freed space is absorbed and no
    // dead zone appears at the right of the row.
    maxWidth: isDpsView ? 460 : 360,
    render: row => <TenderCell row={row} view={view} />,
  };
  const valueColumn: Column<Tender> = {
    key: 'value',
    header: 'Value',
    width: 100,
    align: 'right',
    mono: true,
    render: row => <ValueCell value={row.estimated_value} />,
  };
  const columns: Column<Tender>[] = [
    tenderColumn,
    {
      key: 'status',
      header: 'Status',
      width: 160,
      render: row => <StatusCell row={row} />,
    },
    {
      key: 'client',
      header: 'Client',
      width: 160,
      maxWidth: 160,
      render: row => {
        if (!row.client_name) {
          return (
            <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No client
            </span>
          );
        }
        const nameInner = <TruncatedText>{row.client_name}</TruncatedText>;
        return row.client_website ? (
          <a
            href={row.client_website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="dt-link"
          >
            {nameInner}
          </a>
        ) : (
          nameInner
        );
      },
    },
    ...(isDpsView ? [] : [valueColumn]),
    {
      key: 'fee',
      header: 'Fee',
      width: 90,
      align: 'right',
      mono: true,
      render: row => <ValueCell value={row.evia_fee} />,
    },
    {
      key: 'submission',
      header: 'Submission',
      width: 110,
      align: 'right',
      mono: true,
      render: row => <SubmissionCell row={row} />,
    },
    {
      key: 'award',
      header: 'Award',
      width: 110,
      align: 'right',
      mono: true,
      render: row => <AwardCell row={row} />,
    },
    {
      key: 'assigned',
      header: 'Assigned',
      width: 72,
      align: 'center',
      render: row => <AssignedCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 680,
      align: 'right',
      render: row => (
        <ActionsCell
          row={row}
          onEdit={openEdit}
          onNotes={t => openNotes({ id: t.id, title: t.title })}
          onAdvance={handleAdvance}
          onMarkLost={t => setMarkLostTarget(t)}
          onToggleAwaiting={handleToggleAwaiting}
          onDrop={t => setDropTarget(t)}
        />
      ),
    },
  ];

  const pageDescription = isDpsView
    ? 'Track DPS applications through writing, submission, and admission'
    : 'Track tenders and frameworks through writing, submission, and outcomes';
  const addButtonLabel = isDpsView ? 'Add DPS Application' : 'Add Tender';
  const defaultTypeForAdd: ProcurementType = isDpsView ? 'dps' : 'tender';

  return (
    <>
      <PageHeader
        title="Active Tenders"
        description={pageDescription}
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            {addButtonLabel}
          </Button>
        }
      />

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <SegmentedControl<TenderView>
          ariaLabel="Tender type"
          value={view}
          onChange={switchView}
          options={[
            { value: 'tenders', label: 'Tenders and Frameworks', count: viewSwitchCounts.tenders },
            { value: 'dps',     label: 'DPS',                    count: viewSwitchCounts.dps     },
          ]}
        />
      </div>

      <div className="kpi-row">
        {isDpsView ? (
          <>
            <KPITile
              label="Active Applications"
              value={loading ? 0 : stats.active}
              icon={FileText}
              tone="brand"
              loading={loading}
            />
            <KPITile
              label="Fees in Play"
              value={formatCompactCurrency(pipelineValues.total.fees)}
              hint="No contract value"
              icon={Layers}
              tone="info"
              mono
              loading={loading}
            />
            <KPITile
              label="Admitted"
              value={loading ? 0 : stats.wonCount}
              hint={`${formatCurrency(stats.wonFees)} in fees`}
              icon={Trophy}
              tone="success"
              loading={loading}
            />
            <KPITile
              label="Pass Rate"
              value={
                stats.decided > 0
                  ? `${stats.wonCount} of ${stats.decided} (${stats.winRate}%)`
                  : '0 of 0 (0%)'
              }
              icon={Target}
              tone="warning"
              loading={loading}
            />
          </>
        ) : (
          <>
            <KPITile
              label="Active Tenders"
              value={loading ? 0 : stats.active}
              icon={FileText}
              tone="brand"
              loading={loading}
            />
            <KPITile
              label={pipelineMeta.label}
              value={formatCompactCurrency(pipelineFigures.value)}
              hint={`${formatCompactCurrency(pipelineFigures.fees)} in fees`}
              icon={pipelineMeta.icon}
              tone="info"
              mono
              loading={loading}
              onClick={cyclePipelineState}
              ariaLabel={
                `${pipelineMeta.label}: ${formatCompactCurrency(pipelineFigures.value)}, `
                + `${formatCompactCurrency(pipelineFigures.fees)} in fees. `
                + `Click to cycle to ${PIPELINE_TILE_META[nextPipelineState].label}.`
              }
              footer={
                <div className="kpi-tile-dots" aria-hidden>
                  {PIPELINE_STATE_ORDER.map(s => (
                    <span
                      key={s}
                      className={`kpi-tile-dot${s === pipelineState ? ' kpi-tile-dot-active' : ''}`}
                    />
                  ))}
                </div>
              }
            />
            <KPITile
              label="Won"
              value={formatCurrency(stats.wonValue)}
              hint={`${formatCurrency(stats.wonFees)} in fees`}
              icon={Trophy}
              tone="success"
              mono
              loading={loading}
            />
            <KPITile
              label="Win Rate"
              value={
                stats.decided > 0
                  ? `${stats.wonCount} of ${stats.decided} (${stats.winRate}%)`
                  : '0 of 0 (0%)'
              }
              icon={Target}
              tone="warning"
              loading={loading}
            />
          </>
        )}
      </div>

      <StageTabs tabs={tabsWithCount} activeKey={stage} onChange={setStage} />

      <FilterBar variant="attached">
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search tenders, clients, refs..."
        />
        <Select
          value={assigned ?? 'all'}
          onValueChange={v => setAssigned(v === 'all' ? undefined : v)}
          placeholder="All Assigned"
          width={160}
          ariaLabel="Filter by assignee"
          options={[
            { value: 'all', label: 'All Assigned' },
            { value: 'Vlad', label: 'Vlad' },
            { value: 'Tristan', label: 'Tristan' },
            { value: 'Both', label: 'Both' },
          ]}
        />
        {filtersActive && <FilterBar.Clear onClick={clearFilters} />}
      </FilterBar>

      <DataTable<Tender>
        columns={columns}
        data={filtered}
        rowKey={r => String(r.id)}
        variant="attached"
        ariaLabel="Active tenders"
        isLoading={loading}
        isError={loadError}
        errorMessage="Couldn't load tenders"
        onRetry={fetchData}
        onRowClick={toggleExpand}
        expandedRow={{
          rowId: expandedId,
          render: row => (
            <ExpandPanel
              row={row}
              onEdit={openEdit}
              onNotes={t => openNotes({ id: t.id, title: t.title })}
              onAdvance={handleAdvance}
            />
          ),
        }}
        emptyState={
          scopedTenders.length === 0 && scopedArchived.length === 0 && !debouncedSearch.trim()
            ? {
                message: isDpsView ? 'Your first DPS application awaits' : 'Your first tender awaits',
                action: { label: addButtonLabel, onClick: openAdd },
              }
            : otherViewMatches > 0
              ? {
                  message: `No matches here. ${otherViewMatches} in ${isDpsView ? 'Tenders and Frameworks' : 'DPS'}.`,
                  extra: (
                    <div style={{ marginTop: 12 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => switchView(isDpsView ? 'tenders' : 'dps')}
                      >
                        {isDpsView ? 'View in Tenders and Frameworks' : 'View in DPS'}
                      </Button>
                    </div>
                  ),
                }
              : {
                  message: isDpsView
                    ? 'No DPS applications match these filters'
                    : 'No tenders match these filters',
                  action: { label: 'Clear filters', onClick: clearFilters },
                }
        }
      />

      <TenderDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        clients={clientOptions}
        defaultAssignee={user?.name ?? ''}
        defaultProcurementType={defaultTypeForAdd}
        onSave={handleSave}
      />

      <DropDialog
        open={dropTarget !== null}
        entityName={dropTarget?.title ?? ''}
        entityKind="tender"
        onClose={() => setDropTarget(null)}
        onConfirm={handleDropConfirm}
      />

      <MarkLostDialog
        open={markLostTarget !== null}
        tenderTitle={markLostTarget?.title ?? ''}
        procurementType={markLostTarget?.procurement_type}
        onClose={() => setMarkLostTarget(null)}
        onConfirm={handleMarkLostConfirm}
      />

      <AwaitingInfoDialog
        open={awaitingInfoTarget !== null}
        tenderTitle={awaitingInfoTarget?.title ?? ''}
        onClose={() => setAwaitingInfoTarget(null)}
        onConfirm={handleAwaitingInfoConfirm}
      />

      <NotesPanel
        isOpen={notesPanelTender !== null}
        onClose={() => {
          setNotesPanelTender(null);
          fetchData();
        }}
        title={`${notesPanelTender?.title ?? ''} - Notes`}
        entityType="tender"
        entityId={notesPanelTender?.id ?? null}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Tender"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.title}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
