import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  Clock,
  FileText,
  Pencil,
  Plus,
  Send,
  StickyNote,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import api from '../lib/api';
import type { Client, Tender, DropReason } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { StageTabs } from '../components/StageTabs/StageTabs';
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
  TENDER_STATUS_OPTIONS,
  formatCurrency,
  formatDate,
  formatRelativeDays,
  getStatusLabel,
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

const STAGE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  ...TENDER_STATUS_OPTIONS
    .filter(o => o.value !== 'archived')
    .map(o => ({ key: o.value, label: o.label })),
];

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
    awaiting_info: t.awaiting_info ?? false,
    awaiting_info_note: t.awaiting_info_note ?? '',
    assigned_to: t.assigned_to ?? '',
    notes: t.notes ?? '',
  };
}

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function TenderCell({ row }: { row: Tender }) {
  const titleSpan = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.title}</TruncatedText>
    </span>
  );
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
      {row.reference_number && (
        <span className="dt-cell-secondary">{row.reference_number}</span>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: Tender }) {
  const showAwaiting =
    (row.status === 'writing' || row.status === 'questionnaire_sent') &&
    row.awaiting_info === true;
  const awaitingTooltip = row.awaiting_info_note?.trim() || 'Chasing client for info';
  return (
    <div className="status-stack">
      <Badge variant={STATUS_VARIANT[row.status]} withDot={STATUS_HAS_DOT[row.status]}>
        {getStatusLabel(row.status)}
      </Badge>
      {showAwaiting && (
        <span title={awaitingTooltip}>
          <Badge variant="warning" withDot>Chasing</Badge>
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
 * that direction (forward = ArrowRight, backward = ArrowLeft). */
function ActionsCell({ row, onEdit, onNotes, onAdvance, onMarkLost, onToggleAwaiting, onDrop }: ActionsCellProps) {
  const inActiveStage = row.status === 'questionnaire_sent' || row.status === 'writing';
  const awaitingOn = inActiveStage && row.awaiting_info === true;
  return (
    <span className="dt-actions" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="dt-action dt-action-ghost"
        onClick={() => onNotes(row)}
      >
        <StickyNote size={12} aria-hidden /> Notes
      </button>
      <button
        type="button"
        className="dt-action dt-action-ghost"
        onClick={() => onEdit(row)}
      >
        <Pencil size={12} aria-hidden /> Edit
      </button>

      {inActiveStage && (
        <button
          type="button"
          className={`dt-action dt-action-awaiting${awaitingOn ? ' dt-action-awaiting-active' : ''}`}
          title={awaitingOn ? 'Clear chasing status' : 'Mark this tender as chasing client for info'}
          onClick={() => onToggleAwaiting(row)}
        >
          <Clock size={12} aria-hidden /> {awaitingOn ? 'Clear Chasing' : 'Mark Chasing'}
        </button>
      )}

      {row.status === 'questionnaire_sent' && (
        <>
          <button
            type="button"
            className="dt-action dt-action-ghost"
            onClick={() => onAdvance(row, 'writing')}
          >
            <ArrowRight size={12} aria-hidden /> Move to Writing
          </button>
          <button
            type="button"
            className="dt-action dt-action-ghost"
            onClick={() => onAdvance(row, 'submitted')}
          >
            <Send size={12} aria-hidden /> Mark Submitted
          </button>
        </>
      )}
      {row.status === 'writing' && (
        <>
          <button
            type="button"
            className="dt-action dt-action-ghost"
            onClick={() => onAdvance(row, 'questionnaire_sent')}
          >
            <ArrowLeft size={12} aria-hidden /> Back to Info Gathering
          </button>
          <button
            type="button"
            className="dt-action dt-action-ghost"
            onClick={() => onAdvance(row, 'submitted')}
          >
            <Send size={12} aria-hidden /> Mark Submitted
          </button>
        </>
      )}
      {row.status === 'submitted' && (
        <>
          <button
            type="button"
            className="dt-action dt-action-ghost"
            onClick={() => onAdvance(row, 'writing')}
          >
            <ArrowLeft size={12} aria-hidden /> Back to Writing
          </button>
          <button
            type="button"
            className="dt-action dt-action-primary"
            onClick={() => onAdvance(row, 'won')}
          >
            <Check size={12} aria-hidden /> Mark Won
          </button>
          <button
            type="button"
            className="dt-action dt-action-danger"
            onClick={() => onMarkLost(row)}
          >
            <X size={12} aria-hidden /> Mark Lost
          </button>
        </>
      )}

      <button
        type="button"
        className="dt-action dt-action-drop"
        onClick={() => onDrop(row)}
      >
        Drop
      </button>
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
  const advanceTarget: { label: string; status: string } | null =
    row.status === 'questionnaire_sent'
      ? { label: 'Move to Writing', status: 'writing' }
      : row.status === 'writing'
        ? { label: 'Move to Submitted', status: 'submitted' }
        : row.status === 'submitted'
          ? { label: 'Mark Won', status: 'won' }
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

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /* Filters */
  const [stage, setStage] = useState<string>('questionnaire_sent');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Drawer */
  const [drawerInitial, setDrawerInitial] = useState<
    Partial<TenderFormValues> | null | undefined
  >(undefined);
  const [editingTenderId, setEditingTenderId] = useState<number | null>(null);
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
      const [tendersRes, clientsRes] = await Promise.all([
        api.get('/tenders'),
        api.get('/clients'),
      ]);
      setTenders(tendersRes.data);
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: 0,
      writing: 0,
      questionnaire_sent: 0,
      submitted: 0,
      won: 0,
      lost: 0,
    };
    for (const t of tenders) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (t.status !== 'won' && t.status !== 'lost' && t.status !== 'archived') {
        c.all = (c.all ?? 0) + 1;
      }
    }
    return c;
  }, [tenders]);

  const stats = useMemo(() => {
    const won = tenders.filter(t => t.status === 'won');
    const lost = tenders.filter(t => t.status === 'lost');
    const decided = won.length + lost.length;
    return {
      active: counts.all ?? 0,
      submitted: counts.submitted ?? 0,
      wonValue: won.reduce((s, t) => s + Number(t.estimated_value ?? 0), 0),
      wonFees: won.reduce((s, t) => s + Number(t.evia_fee ?? 0), 0),
      wonCount: won.length,
      decided,
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
    };
  }, [tenders, counts]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return tenders.filter(t => {
      if (stage === 'all') {
        if (t.status === 'won' || t.status === 'lost' || t.status === 'archived') {
          return false;
        }
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
  }, [tenders, stage, debouncedSearch, assigned]);

  const tabsWithCount = STAGE_TABS.map(t => ({ ...t, count: counts[t.key] ?? 0 }));

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
    setDrawerInitial(null);
  }

  function openEdit(t: Tender) {
    setEditingTenderId(t.id);
    setDrawerInitial(tenderToForm(t));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingTenderId(null);
  }

  function openNotes(t: { id: number; title: string }) {
    setNotesPanelTender({ id: t.id, title: t.title });
  }

  async function handleAdvance(t: Tender, newStatus: string) {
    try {
      await api.put(`/tenders/${t.id}`, { status: newStatus });
      const label = newStatus === 'won' ? 'Won' : newStatus === 'lost' ? 'Lost' : getStatusLabel(newStatus);
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
    try {
      if (editingTenderId !== null) {
        await api.put(`/tenders/${editingTenderId}`, payload);
        toast.success('Tender updated');
      } else {
        await api.post('/tenders', payload);
        toast.success('Tender added');
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
    try {
      await api.put(`/tenders/${target.id}`, {
        status: 'lost',
        loss_note: lossNote || null,
      });
      toast.success(`${target.title} marked as Lost`);
      setMarkLostTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to mark as Lost. Please try again.');
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

  const columns: Column<Tender>[] = [
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      maxWidth: 360,
      render: row => <TenderCell row={row} />,
    },
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
    {
      key: 'value',
      header: 'Value',
      width: 100,
      align: 'right',
      mono: true,
      render: row => <ValueCell value={row.estimated_value} />,
    },
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

  return (
    <>
      <PageHeader
        title="Active Tenders"
        description="Track tenders through writing, submission, and outcomes"
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add Tender
          </Button>
        }
      />

      <div className="kpi-row">
        <KPITile
          label="Active Tenders"
          value={loading ? 0 : stats.active}
          icon={FileText}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="Submitted"
          value={loading ? 0 : stats.submitted}
          icon={Send}
          tone="info"
          loading={loading}
        />
        <KPITile
          label="Won Value"
          value={formatCurrency(stats.wonValue)}
          icon={Trophy}
          tone="success"
          mono
          loading={loading}
        />
        <KPITile
          label="Won Fees"
          value={formatCurrency(stats.wonFees)}
          icon={Banknote}
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
        emptyState={{
          message:
            tenders.length === 0
              ? 'Your first tender awaits'
              : 'No tenders match these filters',
          action:
            tenders.length === 0
              ? { label: 'Add Tender', onClick: openAdd }
              : { label: 'Clear filters', onClick: clearFilters },
        }}
      />

      <TenderDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        clients={clientOptions}
        defaultAssignee={user?.name ?? ''}
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
