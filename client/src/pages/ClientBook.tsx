import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Building2,
  Pencil,
  Plus,
  Send,
  StickyNote,
  Trash2,
  Trophy,
  UserPlus,
} from 'lucide-react';
import api from '../lib/api';
import type { Client, Tender } from '../lib/types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { FilterBar } from '../components/FilterBar/FilterBar';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
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

/* Tender statuses that count a client as having a live tender - i.e.
 * something still in the funnel. Won / Lost / Archived / Dropped are
 * excluded because the pipeline no longer needs attention. Kept in
 * sync with the Active Tenders / Scoreboard definitions. */
const LIVE_TENDER_STATUSES: ReadonlySet<string> = new Set([
  'questionnaire_sent',
  'writing',
  'submitted',
]);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
      <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(row)}>
        Delete
      </Button>
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
    /* Preserve the existing status on edit rather than silently
     * rewriting historical rows. The Add flow uses ClientDrawer's
     * EMPTY default of 'active_client' instead. */
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
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
      /* /tenders already excludes dropped + archived, so the sets we
       * derive below (live-tender clients, won-for clients) match the
       * definitions used on Active Tenders and Scoreboard without any
       * extra filtering. */
      const [clientsRes, tendersRes] = await Promise.all([
        api.get('/clients'),
        api.get('/tenders'),
      ]);
      setClients(clientsRes.data);
      setTenders(tendersRes.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const kpis = useMemo(() => {
    const totalClients = clients.length;

    const liveClientIds = new Set<number>();
    const wonClientIds = new Set<number>();
    for (const t of tenders) {
      if (t.client_id == null) continue;
      if (LIVE_TENDER_STATUSES.has(t.status)) liveClientIds.add(t.client_id);
      if (t.status === 'won') wonClientIds.add(t.client_id);
    }

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    let newIn30d = 0;
    for (const c of clients) {
      const created = new Date(c.created_at).getTime();
      if (Number.isFinite(created) && created >= cutoff) newIn30d += 1;
    }

    return {
      totalClients,
      liveTenderClients: liveClientIds.size,
      wonForClients: wonClientIds.size,
      newIn30d,
    };
  }, [clients, tenders]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filteredList = clients.filter(c => {
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
  }, [clients, debouncedSearch, managerFilter, sortKey]);

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
      maxWidth: 240,
      render: row => <CompanyCell row={row} />,
    },
    {
      key: 'contact',
      header: 'Contact',
      width: 160,
      maxWidth: 160,
      render: row => <PlainCell value={row.contact_name} />,
    },
    {
      key: 'email',
      header: 'Email',
      width: 'flex',
      maxWidth: 240,
      render: row => <EmailCell row={row} />,
    },
    {
      key: 'sector',
      header: 'Sector',
      width: 150,
      maxWidth: 150,
      render: row => <PlainCell value={row.sector} />,
    },
    {
      key: 'region',
      header: 'Region',
      width: 130,
      maxWidth: 130,
      render: row => <PlainCell value={row.region} />,
    },
    {
      key: 'manager',
      header: 'Manager',
      width: 100,
      render: row => <ManagerCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 250,
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
        description="Companies we work with. Keep the contact, sector and manager up to date."
        actions={
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add Client
          </Button>
        }
      />

      <div className="kpi-row">
        <KPITile
          label="Total Clients"
          value={loading ? 0 : kpis.totalClients}
          icon={Building2}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="With Live Tender"
          value={loading ? 0 : kpis.liveTenderClients}
          icon={Send}
          tone="info"
          loading={loading}
        />
        <KPITile
          label="Won For"
          value={loading ? 0 : kpis.wonForClients}
          icon={Trophy}
          tone="success"
          loading={loading}
        />
        <KPITile
          label="New (30d)"
          value={loading ? 0 : kpis.newIn30d}
          icon={UserPlus}
          tone="neutral"
          loading={loading}
        />
      </div>

      <FilterBar>
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
