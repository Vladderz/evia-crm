import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Pencil,
  PenLine,
  Plus,
  PoundSterling,
  Receipt,
  Send,
  StickyNote,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import api from '../lib/api';
import type { BidStage, Client, Tender, DropReason, ProcurementType, Invoice, InvoiceCategory } from '../lib/types';
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
import { ShortlistDialog } from '../components/ShortlistDialog/ShortlistDialog';
import { AwaitingInfoDialog } from '../components/AwaitingInfoDialog/AwaitingInfoDialog';
import {
  InvoiceDrawer,
  type InvoiceFormValues,
  type MarkSentSource,
  type TenderPickerOption,
} from '../components/InvoiceDrawer/InvoiceDrawer';
import { MarkPaidDialog } from '../components/MarkPaidDialog/MarkPaidDialog';
import { TenderInvoiceSummary } from '../components/shared/TenderInvoiceSummary';
import { buildInvoiceGroups } from '../lib/invoiceGroups';
import NotesPanel from '../components/NotesPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatRelativeDays,
  isNotShortlisted,
  stageBadge,
  tenderStatusLabel,
  tenderStatusOptions,
  tenderViewOf,
  type TenderView,
} from '../lib/format';
import { useTenderView } from '../lib/useTenderView';

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
    // Same fallback story as procurement_type: display 'single' if the
    // server never returned a stage, and handleSave omits bid_stage
    // from the payload when the loaded value was missing.
    bid_stage: t.bid_stage ?? 'single',
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

function StatusCell({ row, invoice }: { row: Tender; invoice?: Invoice }) {
  const showAwaiting =
    (row.status === 'writing' || row.status === 'questionnaire_sent') &&
    row.awaiting_info === true;
  const awaitingTooltip = row.awaiting_info_note?.trim() || 'Chasing client for info';
  // is_stale is server-computed and only ever true for status==='submitted'.
  // Row stays where it is; the badge is the whole surfacing mechanism.
  const showChase = row.status === 'submitted' && row.is_stale === true;

  const stage = stageBadge(row);

  let invoiceBadge: { variant: BadgeVariant; label: string } | null = null;
  if (invoice) {
    if (invoice.state === 'paid') {
      invoiceBadge = { variant: 'success', label: 'Paid' };
    } else if (invoice.state === 'overdue') {
      invoiceBadge = { variant: 'danger', label: 'Invoice Overdue' };
    } else if (invoice.state === 'awaiting') {
      invoiceBadge = { variant: 'warning', label: 'Invoice Sent' };
    }
  }

  return (
    <div className="status-stack">
      <Badge variant={STATUS_VARIANT[row.status]} withDot={STATUS_HAS_DOT[row.status]}>
        {tenderStatusLabel(row.status, row.procurement_type)}
      </Badge>
      {stage && (
        <Badge variant={stage.variant} withDot>{stage.label}</Badge>
      )}
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
      {invoiceBadge && (
        <Badge variant={invoiceBadge.variant} withDot>{invoiceBadge.label}</Badge>
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
  // Overdue / countdown suffix only applies to rows we are still
  // working. Won, lost and archived have already resolved, so the
  // suffix would just nag about a past date. Show the plain date.
  const isLive =
    row.status === 'questionnaire_sent'
    || row.status === 'writing'
    || row.status === 'submitted';
  const rel = isLive ? formatRelativeDays(row.award_date) : null;
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
  invoice?: Invoice;
  onEdit: (t: Tender) => void;
  onNotes: (t: Tender) => void;
  onAdvance: (t: Tender, status: string) => void;
  onMarkLost: (t: Tender) => void;
  onShortlist: (t: Tender) => void;
  onToggleAwaiting: (t: Tender) => void;
  onDrop: (t: Tender) => void;
  onMarkInvoiceSent: (t: Tender) => void;
  onMarkInvoicePaid: (inv: Invoice) => void;
  onEditInvoice: (inv: Invoice) => void;
}

/* Stage transitions are one-click. Mark Won stays one-click. Mark
 * Lost opens a small confirm dialog with an optional reason note -
 * it's terminal and worth the friction. Edit and Notes are always
 * available. Drop is always available. The funnel is
 * Info Gathering -> Writing -> Submitted; the buttons mirror
 * that direction (forward = ArrowRight, backward = ArrowLeft).
 * DPS records read Admitted / Not Admitted in place of Won / Lost.
 * On Won rows an invoice button sits between Edit and Drop: Mark
 * Invoice Sent if no invoice exists yet, Mark Paid while it is
 * awaiting payment, Edit Invoice once it has been paid. */
function ActionsCell({
  row,
  invoice,
  onEdit,
  onNotes,
  onAdvance,
  onMarkLost,
  onShortlist,
  onToggleAwaiting,
  onDrop,
  onMarkInvoiceSent,
  onMarkInvoicePaid,
  onEditInvoice,
}: ActionsCellProps) {
  const inActiveStage = row.status === 'questionnaire_sent' || row.status === 'writing';
  const awaitingOn = inActiveStage && row.awaiting_info === true;
  const isDps = row.procurement_type === 'dps';
  // A submitted non-DPS PSQ swaps Mark Won / Mark Lost for the
  // shortlist pair. Everything else on the row keeps its usual
  // behaviour, including Back to Writing.
  const isPsqSubmitted =
    !isDps && row.status === 'submitted' && row.bid_stage === 'psq';
  const markWonLabel = isPsqSubmitted
    ? 'Shortlisted'
    : (isDps ? 'Mark Admitted' : 'Mark Won');
  const markLostLabel = isPsqSubmitted
    ? 'Not Shortlisted'
    : (isDps ? 'Mark Not Admitted' : 'Mark Lost');

  // Won rows carry an extra invoice action. No invoice: raise one.
  // Awaiting / overdue: mark it paid. Paid: edit it.
  let invoiceButton: React.ReactNode = null;
  if (row.status === 'won') {
    if (!invoice) {
      invoiceButton = (
        <Button variant="primary" size="sm" icon={Send} onClick={() => onMarkInvoiceSent(row)}>
          Mark Invoice Sent
        </Button>
      );
    } else if (invoice.state === 'awaiting' || invoice.state === 'overdue') {
      invoiceButton = (
        <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => onMarkInvoicePaid(invoice)}>
          Mark Paid
        </Button>
      );
    } else if (invoice.state === 'paid') {
      invoiceButton = (
        <Button variant="secondary" size="sm" icon={Receipt} onClick={() => onEditInvoice(invoice)}>
          Edit Invoice
        </Button>
      );
    }
  }

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

      {invoiceButton}

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
          <Button
            variant="primary"
            size="sm"
            icon={Check}
            onClick={() => isPsqSubmitted ? onShortlist(row) : onAdvance(row, 'won')}
          >
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
  invoice,
  invoiceGroup,
  otherInvoiceCount,
  onEdit,
  onNotes,
  onAdvance,
  onShortlist,
  onMarkInvoiceSent,
  onEditInvoice,
  onMarkInvoicePaid,
}: {
  row: Tender;
  invoice?: Invoice;
  invoiceGroup?: { total: number; itemCount: number } | null;
  otherInvoiceCount: number;
  onEdit: (t: Tender) => void;
  onNotes: (t: Tender) => void;
  onAdvance: (t: Tender, status: string) => void;
  onShortlist: (t: Tender) => void;
  onMarkInvoiceSent: (t: Tender) => void;
  onEditInvoice: (inv: Invoice) => void;
  onMarkInvoicePaid: (inv: Invoice) => void;
}) {
  const isDps = row.procurement_type === 'dps';
  const isPsqSubmitted =
    !isDps && row.status === 'submitted' && row.bid_stage === 'psq';
  const markWonLabel = isDps ? 'Mark Admitted' : 'Mark Won';
  const advanceTarget: { label: string; status: string; onClick?: () => void } | null =
    row.status === 'questionnaire_sent'
      ? { label: 'Move to Writing', status: 'writing' }
      : row.status === 'writing'
        ? { label: 'Move to Submitted', status: 'submitted' }
        : row.status === 'submitted'
          ? isPsqSubmitted
            ? { label: 'Shortlisted', status: 'won', onClick: () => onShortlist(row) }
            : { label: markWonLabel, status: 'won' }
          : null;

  return (
    <>
      <TenderInvoiceSummary
        invoice={invoice}
        invoiceGroup={invoiceGroup ?? null}
        otherInvoiceCount={otherInvoiceCount}
        variant="expand"
        onMarkInvoiceSent={() => onMarkInvoiceSent(row)}
        onMarkInvoicePaid={onMarkInvoicePaid}
        onEditInvoice={onEditInvoice}
      />

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
              onClick={advanceTarget.onClick ?? (() => onAdvance(row, advanceTarget.status))}
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
    </>
  );
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function ActiveTenders() {
  const { user } = useAuth();
  const toast = useToast();

  const { view, setView } = useTenderView();
  const isDpsView = view === 'dps';

  const [tenders, setTenders] = useState<Tender[]>([]);
  // Fetched separately from /tenders?view=archived. The default list
  // deliberately excludes archived, so KPI totals derived from `tenders`
  // stay accurate. Only the Archived tab reads this array.
  const [archivedTenders, setArchivedTenders] = useState<Tender[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  // Fetched separately from the main data so a failure here can never
  // block the rest of the page - invoice awareness is a nice-to-have,
  // Active Tenders must keep working exactly as before if the Income
  // schema is missing or /api/invoices errors.
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesNextNumber, setInvoicesNextNumber] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /* Filters */
  const [stage, setStage] = useState<string>('questionnaire_sent');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  // Bid-stage filter, only meaningful in the Tenders and Frameworks
  // view. Kept in React state (URL is deliberately left out to match
  // the assignee filter's shape). Reset on switch into DPS.
  const [stageFilter, setStageFilter] = useState<BidStage | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function switchView(nextView: TenderView) {
    setView(nextView);
    setExpandedId(null);
    // DPS applications are single round, so the stage filter is
    // hidden there. Clear it so switching back to Tenders and
    // Frameworks starts fresh.
    if (nextView === 'dps') setStageFilter(undefined);
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
  // Same story for bid_stage: undefined = server did not return one
  // (or we are in Add mode), so handleSave omits it from the payload
  // rather than overwriting an unknown value.
  const [editingLoadedStage, setEditingLoadedStage] = useState<Tender['bid_stage'] | undefined>(undefined);
  const drawerOpen = drawerInitial !== undefined;

  /* Notes panel + delete + drop */
  const [notesPanelTender, setNotesPanelTender] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tender | null>(null);
  const [dropTarget, setDropTarget] = useState<Tender | null>(null);
  const [markLostTarget, setMarkLostTarget] = useState<Tender | null>(null);
  const [shortlistTarget, setShortlistTarget] = useState<Tender | null>(null);
  const [awaitingInfoTarget, setAwaitingInfoTarget] = useState<Tender | null>(null);
  // Invoice drawer covers both Mark Invoice Sent (POST) and Edit
  // Invoice (PUT). Only one target is ever set at a time.
  const [invoiceDrawerState, setInvoiceDrawerState] = useState<
    | { mode: 'mark_sent'; source: MarkSentSource }
    | { mode: 'edit'; invoice: Invoice }
    | null
  >(null);
  const [markInvoicePaidTarget, setMarkInvoicePaidTarget] = useState<Invoice | null>(null);
  const [invoiceDrawerError, setInvoiceDrawerError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchInvoices = useCallback(async () => {
    // Best-effort side fetch: any failure is swallowed so the rest of
    // the page keeps working exactly as before if /api/invoices is
    // unavailable (Income schema not yet applied, network blip, ...).
    try {
      const [listRes, nextRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/invoices/next-number'),
      ]);
      setInvoices(listRes.data);
      setInvoicesNextNumber(nextRes.data?.next);
    } catch {
      /* silent */
    }
  }, []);

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
      // Kick off invoices separately so a failure there never leaks
      // into loadError for the main list.
      void fetchInvoices();
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

  /**
   * For each tender: pick the earliest-issued unpaid non-void invoice
   * if there is one; otherwise the most-recently-paid invoice. Powers
   * the Status column badge and the Won-row invoice action.
   */
  const invoiceByTender = useMemo(() => {
    // Ties (same paid_date or same issue_date) break on ascending id
    // so the pick is deterministic. Without this, several items of a
    // shared-number invoice at the same date can flip which one shows
    // on the row between renders.
    const unpaidByTender = new Map<number, Invoice>();
    const paidByTender = new Map<number, Invoice>();
    for (const inv of invoices) {
      if (inv.state === 'void') continue;
      if (inv.tender_id == null) continue;
      if (inv.paid_date) {
        const ex = paidByTender.get(inv.tender_id);
        if (!ex) {
          paidByTender.set(inv.tender_id, inv);
        } else {
          const cur = ex.paid_date ?? '';
          const nxt = inv.paid_date ?? '';
          if (nxt > cur || (nxt === cur && inv.id < ex.id)) {
            paidByTender.set(inv.tender_id, inv);
          }
        }
      } else {
        const ex = unpaidByTender.get(inv.tender_id);
        if (!ex) {
          unpaidByTender.set(inv.tender_id, inv);
        } else if (inv.issue_date < ex.issue_date
            || (inv.issue_date === ex.issue_date && inv.id < ex.id)) {
          unpaidByTender.set(inv.tender_id, inv);
        }
      }
    }
    const map = new Map<number, Invoice>();
    const ids = new Set<number>();
    unpaidByTender.forEach((_, id) => ids.add(id));
    paidByTender.forEach((_, id) => ids.add(id));
    for (const id of ids) {
      const unp = unpaidByTender.get(id);
      if (unp) map.set(id, unp);
      else map.set(id, paidByTender.get(id)!);
    }
    return map;
  }, [invoices]);

  /**
   * Count of non-void invoices per tender. The expand panel shows the
   * primary invoice picked above plus a muted line naming any others,
   * so a tender with two non-void invoices flags the second one.
   */
  const nonVoidInvoiceCountByTender = useMemo(() => {
    const counts = new Map<number, number>();
    for (const inv of invoices) {
      if (inv.state === 'void') continue;
      if (inv.tender_id == null) continue;
      counts.set(inv.tender_id, (counts.get(inv.tender_id) ?? 0) + 1);
    }
    return counts;
  }, [invoices]);

  /**
   * Group index by item id so the Invoice section can flag multi-item
   * invoices with an "Invoice total ... (N items)" line. Groups are
   * built via the shared helper so this page and the Income page see
   * exactly the same shape.
   */
  const invoiceGroupByItemId = useMemo(() => {
    const groups = buildInvoiceGroups(invoices);
    const map = new Map<number, { total: number; itemCount: number }>();
    for (const g of groups) {
      const info = { total: g.total, itemCount: g.itemCount };
      for (const it of g.items) map.set(it.id, info);
    }
    return map;
  }, [invoices]);

  const invoiceDrawerTenderOptions: TenderPickerOption[] = useMemo(() => {
    // Active plus archived tenders. Invoicing a tender at any status is
    // allowed (we sometimes send an invoice before submission and
    // sometimes long after archive), so the picker offers the full set.
    return [...tenders, ...archivedTenders]
      .filter(t => !t.dropped_at)
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        client_id: t.client_id,
        client_name: t.client_name ?? null,
        procurement_type: (t.procurement_type ?? 'tender') as ProcurementType,
        evia_fee: t.evia_fee ?? null,
      }));
  }, [tenders, archivedTenders]);

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
    // Non-DPS PSQs that ended at Lost were dropped before the final
    // round, so the win rate leaves them out and stays about
    // final-stage bids only. isNotShortlisted always returns false
    // on DPS records, so the DPS view carries on unchanged.
    const notShortlistedCount = scopedTenders.filter(isNotShortlisted).length;
    const decided = Math.max(0, won.length + lost.length - notShortlistedCount);
    // Shortlist rate: how many PSQs made it through to the ITT. Y
    // counts every PSQ that has resolved - not-shortlisted lost rows
    // plus rows that are already at stage 'itt' (any status).
    const ittCount = scopedTenders.filter(
      t => t.bid_stage === 'itt' && t.procurement_type !== 'dps',
    ).length;
    const shortlistY = notShortlistedCount + ittCount;
    return {
      active: counts.all ?? 0,
      wonValue: won.reduce((s, t) => s + Number(t.estimated_value ?? 0), 0),
      wonFees: won.reduce((s, t) => s + Number(t.evia_fee ?? 0), 0),
      wonCount: won.length,
      decided,
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
      shortlistX: ittCount,
      shortlistY,
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
    const base = applyRowFilters(source);
    // Stage filter is layered on top so applyRowFilters stays reusable
    // for otherViewMatches - the cross-view hint deliberately ignores
    // it. Only Tenders and Frameworks respects the filter; DPS view
    // resets the value to undefined on switchView so this is really
    // a no-op there.
    if (view !== 'tenders' || !stageFilter) return base;
    return base.filter(t => t.bid_stage === stageFilter);
  }, [scopedTenders, scopedArchived, stage, applyRowFilters, view, stageFilter]);

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
    setStageFilter(undefined);
  }

  function toggleExpand(row: Tender) {
    const id = String(row.id);
    setExpandedId(curr => (curr === id ? null : id));
  }

  function openAdd() {
    setEditingTenderId(null);
    setEditingLoadedType(undefined);
    setEditingLoadedStage(undefined);
    setDrawerInitial(null);
  }

  function openEdit(t: Tender) {
    setEditingTenderId(t.id);
    setEditingLoadedType(t.procurement_type);
    setEditingLoadedStage(t.bid_stage);
    setDrawerInitial(tenderToForm(t));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingTenderId(null);
    setEditingLoadedType(undefined);
    setEditingLoadedStage(undefined);
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
    // bid_stage follows the same rule so an unloaded stage
    // (editingLoadedStage === undefined) can never be overwritten.
    if (editingTenderId === null) {
      payload.bid_stage = values.bid_stage;
    } else if (
      editingLoadedStage !== undefined
      && values.bid_stage !== editingLoadedStage
    ) {
      payload.bid_stage = values.bid_stage;
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
    const isPsq =
      target.procurement_type !== 'dps' && target.bid_stage === 'psq';
    const outcomeLabel = tenderStatusLabel('lost', target.procurement_type);
    try {
      await api.put(`/tenders/${target.id}`, {
        status: 'lost',
        loss_note: lossNote || null,
      });
      if (isPsq) {
        toast.success('Marked as not shortlisted');
      } else {
        toast.success(`${target.title} marked as ${outcomeLabel}`);
      }
      setMarkLostTarget(null);
      fetchData();
    } catch {
      const failLabel = isPsq ? 'not shortlisted' : outcomeLabel;
      toast.error(`Failed to mark as ${failLabel}. Please try again.`);
    }
  }

  async function handleShortlistConfirm({ ittDeadline }: { ittDeadline: string }) {
    if (!shortlistTarget) return;
    const target = shortlistTarget;
    try {
      await api.post(`/tenders/${target.id}/shortlist`, {
        itt_deadline: ittDeadline || null,
      });
      toast.success('Shortlisted: moved to Info Gathering as an ITT');
      setShortlistTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to mark as shortlisted. Please try again.');
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

  function openMarkInvoiceSent(t: Tender) {
    setInvoiceDrawerError(null);
    setInvoiceDrawerState({
      mode: 'mark_sent',
      source: {
        id: t.id,
        title: t.title,
        procurement_type: (t.procurement_type ?? 'tender') as ProcurementType,
        evia_fee: t.evia_fee ?? null,
        client_id: t.client_id,
        client_name: t.client_name ?? null,
      },
    });
  }

  function openEditInvoice(inv: Invoice) {
    setInvoiceDrawerError(null);
    setInvoiceDrawerState({ mode: 'edit', invoice: inv });
  }

  function closeInvoiceDrawer() {
    setInvoiceDrawerState(null);
    setInvoiceDrawerError(null);
  }

  async function handleSaveInvoice(values: InvoiceFormValues) {
    if (!invoiceDrawerState) return;
    setInvoiceDrawerError(null);
    // client_name is only included when no client is selected; the
    // server derives it from the picked client otherwise. contract_label,
    // amount_received, tide_transaction_id, invoice_file and
    // payment_evidence_file are never sent so their stored values
    // survive every edit.
    const payload: Record<string, unknown> = {
      invoice_number: values.invoice_number || null,
      category: values.category as InvoiceCategory,
      tender_id: values.tender_id ? parseInt(values.tender_id, 10) : null,
      client_id: values.client_id ? parseInt(values.client_id, 10) : null,
      description: values.description,
      net_amount: values.net_amount,
      vat_amount: values.vat_amount || '0',
      issue_date: values.issue_date || null,
      due_date: values.due_date || null,
      paid_date: values.paid_date || null,
      notes: values.notes || null,
    };
    if (!values.client_id) {
      payload.client_name = values.client_name;
    }
    try {
      if (invoiceDrawerState.mode === 'edit') {
        await api.put(`/invoices/${invoiceDrawerState.invoice.id}`, payload);
        toast.success('Invoice updated');
      } else {
        const res = await api.post('/invoices', payload);
        const num = res.data?.invoice_number ?? '';
        toast.success(`${num || 'Invoice'} recorded`);
      }
      closeInvoiceDrawer();
      void fetchInvoices();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Something went wrong. Please try again.';
      setInvoiceDrawerError(message);
    }
  }

  async function handleMarkInvoicePaid(payload: { paid_date: string }) {
    if (!markInvoicePaidTarget) return;
    const target = markInvoicePaidTarget;
    try {
      await api.put(`/invoices/${target.id}`, {
        paid_date: payload.paid_date || null,
      });
      toast.success(`${target.invoice_number ?? 'Invoice'} marked paid`);
      setMarkInvoicePaidTarget(null);
      void fetchInvoices();
    } catch {
      toast.error('Failed to mark paid. Please try again.');
    }
  }

  /* ------------- Render ------------- */

  const filtersActive = !!search || !!assigned || !!stageFilter;
  const clientOptions: TenderClientOption[] = clients.map(c => ({
    id: c.id,
    name: c.company_name,
  }));

  const tenderColumn: Column<Tender> = {
    key: 'tender',
    header: 'Tender',
    width: 'flex',
    minWidth: 260,
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
      render: row => <StatusCell row={row} invoice={invoiceByTender.get(row.id)} />,
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
          invoice={invoiceByTender.get(row.id)}
          onEdit={openEdit}
          onNotes={t => openNotes({ id: t.id, title: t.title })}
          onAdvance={handleAdvance}
          onMarkLost={t => setMarkLostTarget(t)}
          onShortlist={t => setShortlistTarget(t)}
          onToggleAwaiting={handleToggleAwaiting}
          onDrop={t => setDropTarget(t)}
          onMarkInvoiceSent={openMarkInvoiceSent}
          onMarkInvoicePaid={inv => setMarkInvoicePaidTarget(inv)}
          onEditInvoice={openEditInvoice}
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
              label="Won Fees"
              value={formatCurrency(stats.wonFees)}
              icon={PoundSterling}
              tone="info"
              mono
              loading={loading}
            />
            <KPITile
              label="Admitted"
              value={loading ? 0 : stats.wonCount}
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
              hint={
                stats.shortlistY > 0
                  ? `Shortlist rate: ${stats.shortlistX} of ${stats.shortlistY}`
                  : undefined
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
        {!isDpsView && (
          <Select
            value={stageFilter ?? 'all'}
            onValueChange={v => setStageFilter(v === 'all' ? undefined : (v as BidStage))}
            placeholder="All Stages"
            width={160}
            ariaLabel="Filter by stage"
            options={[
              { value: 'all',    label: 'All Stages' },
              { value: 'single', label: 'Single Stage' },
              { value: 'psq',    label: 'PSQ' },
              { value: 'itt',    label: 'ITT' },
            ]}
          />
        )}
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
          render: row => {
            const rowInvoice = invoiceByTender.get(row.id);
            const totalCount = nonVoidInvoiceCountByTender.get(row.id) ?? 0;
            return (
              <ExpandPanel
                row={row}
                invoice={rowInvoice}
                invoiceGroup={rowInvoice ? invoiceGroupByItemId.get(rowInvoice.id) ?? null : null}
                otherInvoiceCount={rowInvoice ? Math.max(0, totalCount - 1) : 0}
                onEdit={openEdit}
                onNotes={t => openNotes({ id: t.id, title: t.title })}
                onAdvance={handleAdvance}
                onShortlist={t => setShortlistTarget(t)}
                onMarkInvoiceSent={openMarkInvoiceSent}
                onEditInvoice={openEditInvoice}
                onMarkInvoicePaid={inv => setMarkInvoicePaidTarget(inv)}
              />
            );
          },
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
        belowTopGroup={
          editingTenderId !== null && (() => {
            // Pull the current tender from the loaded rows so the
            // Mark Invoice Sent prefill uses the last saved values,
            // never the drawer's unsaved edits. Archived rows live
            // in a separate list; check both.
            const tender =
              tenders.find(t => t.id === editingTenderId)
              ?? archivedTenders.find(t => t.id === editingTenderId);
            if (!tender) return null;
            const rowInvoice = invoiceByTender.get(tender.id);
            const totalCount = nonVoidInvoiceCountByTender.get(tender.id) ?? 0;
            const rowGroup = rowInvoice ? invoiceGroupByItemId.get(rowInvoice.id) ?? null : null;
            return (
              <TenderInvoiceSummary
                invoice={rowInvoice}
                invoiceGroup={rowGroup}
                otherInvoiceCount={rowInvoice ? Math.max(0, totalCount - 1) : 0}
                variant="drawer"
                onMarkInvoiceSent={() => openMarkInvoiceSent(tender)}
                onMarkInvoicePaid={inv => setMarkInvoicePaidTarget(inv)}
                onEditInvoice={openEditInvoice}
              />
            );
          })()
        }
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
        bidStage={markLostTarget?.bid_stage}
        onClose={() => setMarkLostTarget(null)}
        onConfirm={handleMarkLostConfirm}
      />

      <ShortlistDialog
        open={shortlistTarget !== null}
        tenderTitle={shortlistTarget?.title ?? ''}
        onClose={() => setShortlistTarget(null)}
        onConfirm={handleShortlistConfirm}
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

      <InvoiceDrawer
        open={invoiceDrawerState !== null}
        mode={invoiceDrawerState?.mode ?? 'mark_sent'}
        onClose={closeInvoiceDrawer}
        onSave={handleSaveInvoice}
        clients={clientOptions}
        tenderOptions={invoiceDrawerTenderOptions}
        sourceTender={invoiceDrawerState?.mode === 'mark_sent' ? invoiceDrawerState.source : undefined}
        invoice={invoiceDrawerState?.mode === 'edit' ? invoiceDrawerState.invoice : undefined}
        nextNumber={invoicesNextNumber}
        submitError={invoiceDrawerError}
      />

      <MarkPaidDialog
        open={markInvoicePaidTarget !== null}
        invoice={markInvoicePaidTarget}
        groupSummary={
          markInvoicePaidTarget
            ? (() => {
                const g = invoiceGroupByItemId.get(markInvoicePaidTarget.id);
                return g && g.itemCount > 1
                  ? {
                      invoiceNumber: markInvoicePaidTarget.invoice_number ?? null,
                      itemCount: g.itemCount,
                      total: g.total,
                    }
                  : null;
              })()
            : null
        }
        onClose={() => setMarkInvoicePaidTarget(null)}
        onConfirm={handleMarkInvoicePaid}
      />
    </>
  );
}
