import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  StickyNote,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '../lib/api';
import type { PipelineProspect, DropReason } from '../lib/types';
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
  ProspectDrawer,
  type ProspectFormValues,
  type ProspectStatus,
} from '../components/ProspectDrawer/ProspectDrawer';
import { DropDialog } from '../components/DropDialog/DropDialog';
import NotesPanel from '../components/NotesPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate, formatRelativeDays } from '../lib/format';

/* -----------------------------------------------------------------
 * Status -> Badge mapping (only 2 stages now)
 * ----------------------------------------------------------------- */

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  contacted: 'neutral',
  call_booked: 'info',
};

const STATUS_LABEL: Record<string, string> = {
  contacted: 'Contacted',
  call_booked: 'Call Booked',
};

const STAGE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'call_booked', label: 'Call Booked' },
];

interface PipelineStats {
  active_prospects: number;
  contacted: number;
  call_booked: number;
  overdue_followups: number;
  dropped_30d: number;
  converted_30d: number;
}

const EMPTY_STATS: PipelineStats = {
  active_prospects: 0,
  contacted: 0,
  call_booked: 0,
  overdue_followups: 0,
  dropped_30d: 0,
  converted_30d: 0,
};

/* -----------------------------------------------------------------
 * Map server prospect shape to ProspectDrawer form values
 * ----------------------------------------------------------------- */

function prospectToForm(p: PipelineProspect): Partial<ProspectFormValues> {
  return {
    company_name: p.company_name,
    contact_name: p.contact_name ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    website: p.website ?? '',
    sector: p.sector ?? '',
    region: p.region ?? '',
    tender_title: p.tender_title ?? '',
    tender_url: p.tender_url ?? '',
    tender_reference: p.tender_reference ?? '',
    tender_value: p.tender_value != null ? String(p.tender_value) : '',
    submission_deadline: p.submission_deadline ? p.submission_deadline.slice(0, 10) : '',
    award_date: p.award_date ? p.award_date.slice(0, 10) : '',
    buyer: p.buyer ?? '',
    status: (p.status === 'call_booked' ? 'call_booked' : 'contacted') as ProspectStatus,
    last_contact_date: p.last_contact_date ? p.last_contact_date.slice(0, 10) : '',
    next_followup_date: p.next_followup_date ? p.next_followup_date.slice(0, 10) : '',
    assigned_to: p.assigned_to ?? '',
    notes: '',
  };
}

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function CompanyCell({ row }: { row: PipelineProspect }) {
  const nameSpan = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.company_name}</TruncatedText>
    </span>
  );
  return (
    <div className="dt-cell-2line">
      {row.website ? (
        <a
          href={row.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="dt-link"
        >
          {nameSpan}
        </a>
      ) : (
        nameSpan
      )}
      {row.contact_name && (
        <span className="dt-cell-secondary dt-cell-secondary-sans">
          {row.contact_name}
        </span>
      )}
    </div>
  );
}

function TenderCell({ row }: { row: PipelineProspect }) {
  if (!row.tender_title) {
    return <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>;
  }
  const titleSpan = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.tender_title}</TruncatedText>
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
      {row.buyer && (
        <span className="dt-cell-secondary dt-cell-secondary-sans">
          {row.buyer}
        </span>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: PipelineProspect }) {
  const variant = STATUS_VARIANT[row.status] ?? 'neutral';
  const label = STATUS_LABEL[row.status] ?? row.status;
  return <Badge variant={variant} withDot>{label}</Badge>;
}

function FollowUpCell({ row }: { row: PipelineProspect }) {
  if (!row.next_followup_date) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  const rel = formatRelativeDays(row.next_followup_date);
  if (!rel?.tone) {
    return <span style={{ whiteSpace: 'nowrap' }}>{formatDate(row.next_followup_date)}</span>;
  }
  return (
    <div className="dt-date-2line">
      <span>{formatDate(row.next_followup_date)}</span>
      <span className={`dt-date-suffix dt-date-suffix-${rel.tone}`}>{rel.label}</span>
    </div>
  );
}

function AssignedCell({ row }: { row: PipelineProspect }) {
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
  row: PipelineProspect;
  onAdvance: (p: PipelineProspect) => void;
  onPromote: (p: PipelineProspect) => void;
  onNotes: (p: PipelineProspect) => void;
  onEdit: (p: PipelineProspect) => void;
  onDrop: (p: PipelineProspect) => void;
}

function ActionsCell({ row, onAdvance, onPromote, onNotes, onEdit, onDrop }: ActionsCellProps) {
  return (
    <span className="dt-actions" onClick={e => e.stopPropagation()}>
      {row.status === 'contacted' ? (
        <button
          type="button"
          className="dt-action dt-action-primary"
          onClick={() => onAdvance(row)}
        >
          <Calendar size={12} aria-hidden /> Book Call
        </button>
      ) : (
        <button
          type="button"
          className="dt-action dt-action-primary"
          onClick={() => onPromote(row)}
        >
          <Send size={12} aria-hidden /> Push to Active
        </button>
      )}
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

function ExpandPanel({ row, onNotes, onEdit }: {
  row: PipelineProspect;
  onNotes: (p: PipelineProspect) => void;
  onEdit: (p: PipelineProspect) => void;
}) {
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
          {row.email && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Email: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.email}</span>
            </div>
          )}
          {row.phone && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Phone: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.phone}</span>
            </div>
          )}
          {row.sector && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Sector: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.sector}</span>
            </div>
          )}
          {row.region && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Region: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>{row.region}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="dt-expand-section-title">Quick Actions</div>
        <div className="dt-expand-actions">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(row)}>
            Edit prospect
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

export default function SalesPipeline() {
  const { user } = useAuth();
  const toast = useToast();

  const [prospects, setProspects] = useState<PipelineProspect[]>([]);
  const [stats, setStats] = useState<PipelineStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [stage, setStage] = useState<string>('contacted');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  const [sector, setSector] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [drawerInitial, setDrawerInitial] = useState<
    Partial<ProspectFormValues> | null | undefined
  >(undefined);
  const [editingId, setEditingId] = useState<number | null>(null);
  const drawerOpen = drawerInitial !== undefined;

  const [notesProspect, setNotesProspect] = useState<PipelineProspect | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PipelineProspect | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<PipelineProspect | null>(null);
  const [dropTarget, setDropTarget] = useState<PipelineProspect | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/pipeline'),
        api.get('/pipeline/stats'),
      ]);
      setProspects(listRes.data);
      setStats(statsRes.data ?? EMPTY_STATS);
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
    const c: Record<string, number> = { all: prospects.length, contacted: 0, call_booked: 0 };
    for (const p of prospects) {
      c[p.status] = (c[p.status] ?? 0) + 1;
    }
    return c;
  }, [prospects]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) {
      if (p.sector && p.sector.trim()) set.add(p.sector.trim());
    }
    return [
      { value: 'all', label: 'All Sectors' },
      ...Array.from(set).sort().map(s => ({ value: s, label: s })),
    ];
  }, [prospects]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return prospects.filter(p => {
      if (stage !== 'all' && p.status !== stage) return false;
      if (assigned && p.assigned_to !== assigned) return false;
      if (sector && p.sector !== sector) return false;
      if (q) {
        const hay = `${p.company_name} ${p.contact_name ?? ''} ${p.tender_title ?? ''} ${p.buyer ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [prospects, stage, debouncedSearch, assigned, sector]);

  const tabsWithCount = STAGE_TABS.map(t => ({ ...t, count: counts[t.key] ?? 0 }));

  const dropRateDisplay = useMemo(() => {
    const denom = stats.dropped_30d + stats.converted_30d;
    if (denom === 0) return '-';
    const pct = Math.round((stats.dropped_30d / denom) * 100);
    return `${pct}%`;
  }, [stats]);

  /* ------------- Handlers ------------- */

  function clearFilters() {
    setSearch('');
    setAssigned(undefined);
    setSector(undefined);
  }

  function toggleExpand(row: PipelineProspect) {
    const id = String(row.id);
    setExpandedId(curr => (curr === id ? null : id));
  }

  function openAdd() {
    setEditingId(null);
    setDrawerInitial(null);
  }

  function openEdit(p: PipelineProspect) {
    setEditingId(p.id);
    setDrawerInitial(prospectToForm(p));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingId(null);
  }

  function openNotes(p: PipelineProspect) {
    setNotesProspect(p);
  }

  async function handleAdvance(p: PipelineProspect) {
    try {
      await api.post(`/pipeline/${p.id}/advance`);
      toast.success(`${p.company_name} moved to Call Booked`);
      fetchData();
    } catch {
      toast.error('Failed to advance prospect. Please try again.');
    }
  }

  async function handlePromoteConfirm() {
    if (!promoteTarget) return;
    const target = promoteTarget;
    setPromoteTarget(null);
    try {
      await api.post(`/pipeline/${target.id}/promote`);
      toast.success(`${target.company_name} pushed to Active Tenders`);
      fetchData();
    } catch {
      toast.error('Failed to push to Active Tenders. Please try again.');
    }
  }

  async function handleDropConfirm({ reason, note }: { reason: DropReason; note: string }) {
    if (!dropTarget) return;
    const target = dropTarget;
    try {
      await api.post(`/pipeline/${target.id}/drop`, { reason, note });
      toast.success(`${target.company_name} moved to No Man's Land`);
      setDropTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to drop prospect. Please try again.');
    }
  }

  async function handleSave(values: ProspectFormValues) {
    const payload = {
      company_name: values.company_name.trim(),
      contact_name: values.contact_name || null,
      email: values.email || null,
      phone: values.phone || null,
      website: values.website || null,
      sector: values.sector || null,
      region: values.region || null,
      tender_title: values.tender_title || null,
      tender_url: values.tender_url || null,
      tender_reference: values.tender_reference || null,
      tender_value: values.tender_value ? parseFloat(values.tender_value) : null,
      submission_deadline: values.submission_deadline || null,
      award_date: values.award_date || null,
      buyer: values.buyer || null,
      status: values.status,
      last_contact_date: values.last_contact_date || null,
      next_followup_date: values.next_followup_date || null,
      assigned_to: values.assigned_to || null,
    };
    try {
      if (editingId !== null) {
        await api.put(`/pipeline/${editingId}`, payload);
        toast.success('Prospect updated');
      } else {
        await api.post('/pipeline', payload);
        toast.success('Prospect added');
      }
      closeDrawer();
      fetchData();
    } catch {
      toast.error(
        editingId !== null
          ? 'Failed to update prospect. Please try again.'
          : 'Failed to add prospect. Please try again.',
      );
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const name = deleteTarget.company_name;
    try {
      await api.delete(`/pipeline/${deleteTarget.id}`);
      toast.success(`${name} deleted`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete prospect. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  const filtersActive = !!search || !!assigned || !!sector;

  const columns: Column<PipelineProspect>[] = [
    {
      key: 'company',
      header: 'Company',
      width: 'flex',
      maxWidth: 200,
      render: row => <CompanyCell row={row} />,
    },
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      maxWidth: 260,
      render: row => <TenderCell row={row} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: row => <StatusCell row={row} />,
    },
    {
      key: 'last_contact',
      header: 'Last Contact',
      width: 110,
      align: 'right',
      mono: true,
      render: row =>
        row.last_contact_date ? (
          formatDate(row.last_contact_date)
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        ),
    },
    {
      key: 'next_followup',
      header: 'Next Follow-up',
      width: 130,
      align: 'right',
      mono: true,
      render: row => <FollowUpCell row={row} />,
    },
    {
      key: 'assigned',
      header: 'Assigned',
      width: 96,
      align: 'center',
      render: row => <AssignedCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 280,
      align: 'right',
      render: row => (
        <ActionsCell
          row={row}
          onAdvance={handleAdvance}
          onPromote={p => setPromoteTarget(p)}
          onNotes={openNotes}
          onEdit={openEdit}
          onDrop={p => setDropTarget(p)}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales Pipeline"
        description="Move prospects from contact to a booked call. Push to Active Tenders when they're ready."
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add Prospect
          </Button>
        }
      />

      <div className="kpi-row">
        <KPITile
          label="Active Prospects"
          value={loading ? 0 : stats.active_prospects}
          icon={Users}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="Contacted"
          value={loading ? 0 : stats.contacted}
          icon={MessageCircle}
          tone="neutral"
          loading={loading}
        />
        <KPITile
          label="Call Booked"
          value={loading ? 0 : stats.call_booked}
          icon={Calendar}
          tone="info"
          loading={loading}
        />
        <KPITile
          label="Converted (30d)"
          value={loading ? 0 : stats.converted_30d}
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <KPITile
          label="Drop Rate (30d)"
          value={dropRateDisplay}
          hint={
            stats.dropped_30d + stats.converted_30d > 0
              ? `${stats.dropped_30d} dropped / ${stats.converted_30d} converted`
              : undefined
          }
          icon={stats.dropped_30d > 0 ? AlertCircle : TrendingUp}
          tone={stats.dropped_30d > 0 ? 'danger' : 'neutral'}
          loading={loading}
        />
      </div>

      <StageTabs tabs={tabsWithCount} activeKey={stage} onChange={setStage} />

      <FilterBar variant="attached">
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search by company, contact, tender..."
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
        <Select
          value={sector ?? 'all'}
          onValueChange={v => setSector(v === 'all' ? undefined : v)}
          placeholder="All Sectors"
          width={180}
          ariaLabel="Filter by sector"
          options={sectorOptions}
        />
        {filtersActive && <FilterBar.Clear onClick={clearFilters} />}
      </FilterBar>

      <DataTable<PipelineProspect>
        columns={columns}
        data={filtered}
        rowKey={r => String(r.id)}
        variant="attached"
        ariaLabel="Sales pipeline"
        isLoading={loading}
        isError={loadError}
        errorMessage="Couldn't load prospects"
        onRetry={fetchData}
        onRowClick={toggleExpand}
        expandedRow={{
          rowId: expandedId,
          render: row => <ExpandPanel row={row} onNotes={openNotes} onEdit={openEdit} />,
        }}
        emptyState={{
          message:
            prospects.length === 0
              ? 'Track your first prospect'
              : 'No prospects match these filters',
          action:
            prospects.length === 0
              ? { label: 'Add Prospect', onClick: openAdd }
              : { label: 'Clear filters', onClick: clearFilters },
        }}
      />

      <ProspectDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        defaultAssignee={user?.name ?? ''}
        onSave={handleSave}
      />

      <DropDialog
        open={dropTarget !== null}
        entityName={dropTarget?.company_name ?? ''}
        entityKind="prospect"
        onClose={() => setDropTarget(null)}
        onConfirm={handleDropConfirm}
      />

      <NotesPanel
        isOpen={notesProspect !== null}
        onClose={() => {
          setNotesProspect(null);
          fetchData();
        }}
        title={`${notesProspect?.company_name ?? ''} - Notes`}
        entityType="pipeline"
        entityId={notesProspect?.id ?? null}
      />

      <ConfirmDialog
        open={promoteTarget !== null}
        title="Push to Active Tenders"
        message={
          promoteTarget
            ? `Push ${promoteTarget.company_name} to Active Tenders? This creates a client record (if needed) and a new tender at the Writing stage. The prospect row will be removed from this list.`
            : ''
        }
        confirmLabel="Push to Active"
        onConfirm={handlePromoteConfirm}
        onCancel={() => setPromoteTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Prospect"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.company_name}? This cannot be undone. (Tip: drop instead to keep them in No Man's Land for later.)`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
