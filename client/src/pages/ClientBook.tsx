import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Building2,
  CheckCircle2,
  MessageCircle,
  Pencil,
  Plus,
  StickyNote,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import api from '../lib/api';
import type { Client } from '../lib/types';
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
import { Select } from '../components/Select/Select';
import {
  ClientDrawer,
  type ClientFormValues,
} from '../components/ClientDrawer/ClientDrawer';
import NotesPanel from '../components/NotesPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../lib/format';

/* -----------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------------- */

interface Stats {
  total: number;
  active_client: number;
  seeking_tender: number;
  prospect: number;
}

const EMPTY_STATS: Stats = {
  total: 0,
  active_client: 0,
  seeking_tender: 0,
  prospect: 0,
};

const STATUS_LABEL: Record<string, string> = {
  active_client: 'Active Client',
  seeking_tender: 'Seeking Tender',
  prospect: 'Prospect',
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active_client: 'success',
  seeking_tender: 'info',
  prospect: 'neutral',
};

const STAGE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active_client', label: 'Active Client' },
  { key: 'seeking_tender', label: 'Seeking Tender' },
  { key: 'prospect', label: 'Prospect' },
];

type SortKey = 'recent' | 'alpha' | 'oldest';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'alpha',  label: 'Alphabetical' },
  { value: 'oldest', label: 'Oldest First' },
];

const MANAGER_LABEL: Record<string, string> = {
  vlad: 'Vlad',
  tristan: 'Tristan',
  both: 'Both',
};

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function CompanyCell({ row }: { row: Client }) {
  const href = row.website
    ? (row.website.startsWith('http') ? row.website : `https://${row.website}`)
    : null;
  const inner = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.company_name}</TruncatedText>
    </span>
  );
  return href ? (
    <a
      href={href}
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

function EmailCell({ row }: { row: Client }) {
  if (!row.email) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return (
    <a
      href={`mailto:${row.email}`}
      onClick={e => e.stopPropagation()}
      className="dt-link"
    >
      <TruncatedText>{row.email}</TruncatedText>
    </a>
  );
}

function PlainCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return <TruncatedText>{value}</TruncatedText>;
}

function StatusCell({ row }: { row: Client }) {
  const variant = STATUS_VARIANT[row.status] ?? 'neutral';
  const label = STATUS_LABEL[row.status] ?? row.status;
  return <Badge variant={variant} withDot>{label}</Badge>;
}

function ManagerCell({ row }: { row: Client }) {
  const key = row.account_manager ?? 'vlad';
  return <>{MANAGER_LABEL[key] ?? key}</>;
}

interface ActionsCellProps {
  row: Client;
  onNotes: (c: Client) => void;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
}

function ActionsCell({ row, onNotes, onEdit, onDelete }: ActionsCellProps) {
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
      <button
        type="button"
        className="dt-action dt-action-drop"
        onClick={() => onDelete(row)}
        aria-label="Delete"
      >
        <Trash2 size={12} aria-hidden /> Delete
      </button>
    </span>
  );
}

/* -----------------------------------------------------------------
 * Expand panel: latest note (or a placeholder)
 * ----------------------------------------------------------------- */

function ExpandPanel({ row, onNotes }: { row: Client; onNotes: (c: Client) => void }) {
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
    </div>
  );
}

/* -----------------------------------------------------------------
 * Map server client to drawer form values
 * ----------------------------------------------------------------- */

function clientToForm(c: Client): Partial<ClientFormValues> {
  return {
    company_name: c.company_name,
    contact_name: c.contact_name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    website: c.website ?? '',
    sector: c.sector ?? '',
    region: c.region ?? '',
    status: c.status,
    account_manager: (c.account_manager ?? 'vlad') as ClientFormValues['account_manager'],
    notes: c.notes ?? '',
  };
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function ClientBook() {
  const toast = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [stage, setStage] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState<string | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [drawerInitial, setDrawerInitial] = useState<
    Partial<ClientFormValues> | null | undefined
  >(undefined);
  const [editingId, setEditingId] = useState<number | null>(null);
  const drawerOpen = drawerInitial !== undefined;

  const [notesClient, setNotesClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [clientsRes, statsRes] = await Promise.all([
        api.get('/clients'),
        api.get('/clients/stats'),
      ]);
      setClients(clientsRes.data);
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
    const c: Record<string, number> = {
      all: clients.length,
      active_client: 0,
      seeking_tender: 0,
      prospect: 0,
    };
    for (const client of clients) {
      c[client.status] = (c[client.status] ?? 0) + 1;
    }
    return c;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filteredList = clients.filter(c => {
      if (stage !== 'all' && c.status !== stage) return false;
      if (managerFilter) {
        const m = c.account_manager ?? 'vlad';
        if (managerFilter === 'both' && m !== 'both') return false;
        if (managerFilter === 'vlad' && m !== 'vlad' && m !== 'both') return false;
        if (managerFilter === 'tristan' && m !== 'tristan' && m !== 'both') return false;
      }
      if (q) {
        const hay = `${c.company_name} ${c.contact_name ?? ''} ${c.sector ?? ''} ${c.region ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filteredList.sort((a, b) => {
      if (sortKey === 'alpha') return a.company_name.localeCompare(b.company_name);
      if (sortKey === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [clients, stage, debouncedSearch, managerFilter, sortKey]);

  const tabsWithCount = STAGE_TABS.map(t => ({ ...t, count: counts[t.key] ?? 0 }));

  const filtersActive = !!search || !!managerFilter || sortKey !== 'recent';

  /* ------------- Handlers ------------- */

  function clearFilters() {
    setSearch('');
    setManagerFilter(undefined);
    setSortKey('recent');
  }

  function toggleExpand(row: Client) {
    const id = String(row.id);
    setExpandedId(curr => (curr === id ? null : id));
  }

  function openAdd() {
    setEditingId(null);
    setDrawerInitial(null);
  }

  function openEdit(c: Client) {
    setEditingId(c.id);
    setDrawerInitial(clientToForm(c));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
    setEditingId(null);
  }

  async function handleSave(values: ClientFormValues) {
    try {
      if (editingId !== null) {
        await api.put(`/clients/${editingId}`, values);
        toast.success('Client updated successfully');
      } else {
        await api.post('/clients', values);
        toast.success('Client added successfully');
      }
      closeDrawer();
      fetchData();
    } catch {
      toast.error(
        editingId !== null
          ? 'Failed to update client. Please try again.'
          : 'Failed to add client. Please try again.',
      );
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const name = deleteTarget.company_name;
    try {
      await api.delete(`/clients/${deleteTarget.id}`);
      toast.success(`${name} deleted`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete client. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  const columns: Column<Client>[] = [
    {
      key: 'company',
      header: 'Company',
      width: 'flex',
      maxWidth: 220,
      render: row => <CompanyCell row={row} />,
    },
    {
      key: 'contact',
      header: 'Contact',
      width: 140,
      maxWidth: 140,
      render: row => <PlainCell value={row.contact_name} />,
    },
    {
      key: 'email',
      header: 'Email',
      width: 'flex',
      maxWidth: 220,
      render: row => <EmailCell row={row} />,
    },
    {
      key: 'sector',
      header: 'Sector',
      width: 140,
      maxWidth: 140,
      render: row => <PlainCell value={row.sector} />,
    },
    {
      key: 'region',
      header: 'Region',
      width: 120,
      maxWidth: 120,
      render: row => <PlainCell value={row.region} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 140,
      render: row => <StatusCell row={row} />,
    },
    {
      key: 'manager',
      header: 'Manager',
      width: 90,
      render: row => <ManagerCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 240,
      align: 'right',
      render: row => (
        <ActionsCell
          row={row}
          onNotes={c => setNotesClient(c)}
          onEdit={openEdit}
          onDelete={c => setDeleteTarget(c)}
        />
      ),
    },
  ];

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <PageHeader
        title="Client Book"
        description="Companies we work with and the ones we are chasing. Keep the contact, sector and manager up to date."
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add Client
          </Button>
        }
      />

      <div className="kpi-row">
        <KPITile
          label="Total Clients"
          value={loading ? 0 : stats.total}
          icon={Building2}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="Active Clients"
          value={loading ? 0 : stats.active_client}
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <KPITile
          label="Prospects"
          value={loading ? 0 : stats.prospect}
          icon={Users}
          tone="neutral"
          loading={loading}
        />
        <KPITile
          label="Seeking Tender"
          value={loading ? 0 : stats.seeking_tender}
          icon={Target}
          tone="info"
          loading={loading}
        />
      </div>

      <StageTabs tabs={tabsWithCount} activeKey={stage} onChange={setStage} />

      <FilterBar variant="attached">
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search clients..."
        />
        <Select
          value={managerFilter ?? 'all'}
          onValueChange={v => setManagerFilter(v === 'all' ? undefined : v)}
          placeholder="All Managers"
          width={160}
          ariaLabel="Filter by manager"
          options={[
            { value: 'all', label: 'All Managers' },
            { value: 'vlad', label: 'Vlad' },
            { value: 'tristan', label: 'Tristan' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <Select
          value={sortKey}
          onValueChange={v => setSortKey(v as SortKey)}
          width={160}
          ariaLabel="Sort by"
          options={SORT_OPTIONS}
        />
        {filtersActive && <FilterBar.Clear onClick={clearFilters} />}
      </FilterBar>

      <DataTable<Client>
        columns={columns}
        data={filtered}
        rowKey={r => String(r.id)}
        variant="attached"
        ariaLabel="Client book"
        isLoading={loading}
        isError={loadError}
        errorMessage="Couldn't load clients"
        onRetry={fetchData}
        onRowClick={toggleExpand}
        expandedRow={{
          rowId: expandedId,
          render: row => <ExpandPanel row={row} onNotes={c => setNotesClient(c)} />,
        }}
        emptyState={{
          message:
            clients.length === 0
              ? 'No clients yet. Add your first client to get started.'
              : 'No clients match these filters',
          action:
            clients.length === 0
              ? { label: 'Add Client', onClick: openAdd }
              : { label: 'Clear filters', onClick: clearFilters },
        }}
      />

      <ClientDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        onSave={handleSave}
      />

      <NotesPanel
        isOpen={notesClient !== null}
        onClose={() => {
          setNotesClient(null);
          fetchData();
        }}
        title={`${notesClient?.company_name ?? ''} - Notes`}
        entityType="client"
        entityId={notesClient?.id ?? null}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Client"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.company_name}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </Tooltip.Provider>
  );
}
