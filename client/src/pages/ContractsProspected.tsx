import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Calendar, CalendarDays, Plus, Send, Trash2, User } from 'lucide-react';
import api from '../lib/api';
import type { ProspectedContract } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { FilterBar } from '../components/FilterBar/FilterBar';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge, type BadgeVariant } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Input } from '../components/Input/Input';
import { Drawer } from '../components/Drawer/Drawer';
import ConfirmDialog from '../components/ConfirmDialog';

/* -----------------------------------------------------------------
 * Types + helpers
 * ----------------------------------------------------------------- */

interface ProspectedStats {
  today: number;
  this_week: number;
  vlad_today: number;
  vlad_week: number;
  tristan_today: number;
  tristan_week: number;
}

const EMPTY_STATS: ProspectedStats = {
  today: 0,
  this_week: 0,
  vlad_today: 0,
  vlad_week: 0,
  tristan_today: 0,
  tristan_week: 0,
};

interface FormState {
  title: string;
  url: string;
  submission_deadline: string;
  source: 'fts' | 'manual';
  ocds_id: string | null;
}

const EMPTY_FORM: FormState = {
  title: '',
  url: '',
  submission_deadline: '',
  source: 'manual',
  ocds_id: null,
};

/* Local formatDate preserves the "27 Mar 2026" full-year rendering the
 * page has always shown. lib/format.ts formatDate returns 2-digit year
 * ("27 Mar 26"), which is used elsewhere but would be a rendering change
 * for this page. Keep local. */
function formatDate(iso: string): string {
  const dateStr = iso.slice(0, 10);
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* Deadline urgency mapping - thresholds preserved from the pre-conversion
 * page. Overdue / Today / <7 days = danger (red), <14 days = warning
 * (amber), >=14 days = success (green). */
function getDeadlineChip(iso: string): { text: string; variant: BadgeVariant } {
  const dateStr = iso.slice(0, 10);
  const [year, month, day] = dateStr.split('-').map(Number);
  const deadline = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', variant: 'danger' };
  if (diffDays === 0) return { text: 'Today', variant: 'danger' };
  if (diffDays < 7) return { text: `${diffDays} day${diffDays === 1 ? '' : 's'}`, variant: 'danger' };
  if (diffDays < 14) return { text: `${diffDays} days`, variant: 'warning' };
  return { text: `${diffDays} days`, variant: 'success' };
}

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function ContractCell({ row }: { row: ProspectedContract }) {
  const inner = (
    <span className="dt-cell-primary">
      <TruncatedText>{row.title}</TruncatedText>
    </span>
  );
  if (!row.url) return inner;
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="dt-link"
    >
      {inner}
    </a>
  );
}

function SourceCell({ row }: { row: ProspectedContract }) {
  if (row.source === 'fts') return <Badge variant="success">FTS</Badge>;
  return <Badge variant="neutral">Manual</Badge>;
}

function DeadlineCell({ row }: { row: ProspectedContract }) {
  const chip = getDeadlineChip(row.submission_deadline);
  return (
    <div className="dt-date-2line">
      <span>{formatDate(row.submission_deadline)}</span>
      <Badge variant={chip.variant} size="sm">{chip.text}</Badge>
    </div>
  );
}

interface ActionsCellProps {
  row: ProspectedContract;
  inPipeline: boolean;
  onAddToPipeline: (row: ProspectedContract) => void;
  onPromote: (row: ProspectedContract) => void;
  onDelete: (row: ProspectedContract) => void;
}

function ActionsCell({ row, inPipeline, onAddToPipeline, onPromote, onDelete }: ActionsCellProps) {
  return (
    <span
      className="dt-actions"
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', gap: 6 }}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={inPipeline}
        onClick={() => onAddToPipeline(row)}
      >
        {inPipeline ? 'In Pipeline' : 'Add to Pipeline'}
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={Send}
        onClick={() => onPromote(row)}
      >
        Promote
      </Button>
      <Button
        variant="danger"
        size="sm"
        icon={Trash2}
        onClick={() => onDelete(row)}
      >
        Delete
      </Button>
    </span>
  );
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function ContractsProspected() {
  const toast = useToast();
  const { user } = useAuth();

  const [contracts, setContracts] = useState<ProspectedContract[]>([]);
  const [stats, setStats] = useState<ProspectedStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [urlInput, setUrlInput] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState('Add contract');
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [titleError, setTitleError] = useState(false);
  const [deadlineError, setDeadlineError] = useState(false);
  const [deadlineHint, setDeadlineHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<ProspectedContract | null>(null);
  const [pipelineIds, setPipelineIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [contractsRes, statsRes] = await Promise.all([
        api.get('/prospected'),
        api.get('/prospected/stats'),
      ]);
      setContracts(contractsRes.data);
      setStats(statsRes.data ?? EMPTY_STATS);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    api.get('/pipeline').then(res => {
      const ids = new Set<number>(
        (res.data as Array<{ prospected_contract_id: number | null }>)
          .filter(p => p.prospected_contract_id != null)
          .map(p => p.prospected_contract_id as number),
      );
      setPipelineIds(ids);
    }).catch(() => {
      /* Silent - button falls back to available. */
    });
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c => c.title.toLowerCase().includes(q));
  }, [contracts, debouncedSearch]);

  /* ------------- Panel + URL bar ------------- */

  function openPanel(prefill: Partial<FormState>, title: string, hint: string | null = null) {
    setForm({ ...EMPTY_FORM, ...prefill });
    setPanelTitle(title);
    setTitleError(false);
    setDeadlineError(false);
    setDeadlineHint(hint);
    setPanelOpen(true);
  }

  async function handleAdd() {
    setDuplicateError(null);
    const trimmed = urlInput.trim();

    if (!trimmed) {
      openPanel({}, 'Add contract');
      return;
    }

    const isFts = trimmed.toLowerCase().includes('find-tender.service.gov.uk');

    if (!isFts) {
      openPanel({ url: trimmed }, 'Add contract');
      return;
    }

    /* Perf: open the panel synchronously and run the FTS extract in the
     * background. When it resolves we patch in title / deadline / ocds_id
     * only if the user has not already typed something there. The url
     * field acts as the identity check - if the panel was closed and
     * reopened for a different URL before the extract resolved, we drop
     * the stale result. Do not turn this into an awaited pre-open. */
    openPanel({ url: trimmed, source: 'fts' }, 'Add contract (FTS)');
    setExtracting(true);
    try {
      const res = await api.post('/prospected/extract', { url: trimmed });
      if (res.data.success && res.data.data?.title) {
        const { title, submission_deadline, ocds_id, notice_tag } = res.data.data;
        setForm(prev => {
          if (prev.url !== trimmed) return prev;
          return {
            ...prev,
            title: prev.title || title,
            submission_deadline: prev.submission_deadline || (submission_deadline ?? ''),
            ocds_id: prev.ocds_id || ocds_id,
            source: 'fts',
          };
        });
        if (!submission_deadline) {
          setDeadlineHint(
            notice_tag === 'planning'
              ? 'Pipeline notice - no deadline published. Enter manually if known.'
              : 'No deadline published for this notice. Enter manually if known.',
          );
        }
      } else {
        toast.error(res.data.message || 'Could not extract details from this URL. Please enter the details manually.');
      }
    } catch {
      toast.error('Could not extract details from this URL. Please enter the details manually.');
    } finally {
      setExtracting(false);
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (key === 'title') setTitleError(false);
    if (key === 'submission_deadline') {
      setDeadlineError(false);
      setDeadlineHint(null);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    let hasError = false;
    if (!form.title.trim()) { setTitleError(true); hasError = true; }
    if (!form.submission_deadline) { setDeadlineError(true); hasError = true; }
    if (hasError) return;

    setSaving(true);
    try {
      const res = await api.post<ProspectedContract>('/prospected', {
        title: form.title.trim(),
        url: form.url.trim() || null,
        submission_deadline: form.submission_deadline,
        source: form.source,
        ocds_id: form.ocds_id,
      });
      /* Perf: optimistic local update. GET /prospected is a pure SELECT
       * (cleanup was moved to server startup) so a refetch here would
       * both feel slow and undo the snappy "new row on top" moment. Do
       * not reintroduce fetchData() here. Same reason for the stats
       * increment: server /prospected/stats is another round-trip we
       * skip by mirroring the change locally. */
      const created: ProspectedContract = {
        ...res.data,
        added_by_name: user?.name ?? '',
      };
      setContracts(prev => [created, ...prev]);
      setStats(prev => {
        const next = { ...prev, today: prev.today + 1, this_week: prev.this_week + 1 };
        if (user?.email === 'vlad@eviamarketing.co.uk') {
          next.vlad_today = prev.vlad_today + 1;
          next.vlad_week = prev.vlad_week + 1;
        } else if (user?.email === 'tristan@eviamarketing.co.uk') {
          next.tristan_today = prev.tristan_today + 1;
          next.tristan_week = prev.tristan_week + 1;
        }
        return next;
      });
      toast.success('Contract added');
      setUrlInput('');
      setDuplicateError(null);
      setPanelOpen(false);
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { error?: string; existing?: { added_by_name?: string; created_at?: string; stage?: string } } } })?.response;
      const status = response?.status;
      if (status === 409) {
        const ex = response?.data?.existing;
        const who = ex?.added_by_name || 'another user';
        const when = ex?.created_at ? formatDate(ex.created_at) : null;
        const stage = ex?.stage || 'Contracts Prospected';
        const msg = when
          ? `Already added by ${who} on ${when} (${stage}).`
          : `Already added by ${who} (${stage}).`;
        setDuplicateError(msg);
        setPanelOpen(false);
      } else {
        toast.error('Failed to add contract. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddToPipeline(contract: ProspectedContract) {
    try {
      await api.post(`/pipeline/from-prospected/${contract.id}`);
      toast.success('Added to Sales Pipeline');
      setPipelineIds(prev => new Set([...prev, contract.id]));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (status === 409) {
        toast.error(message || 'Already in Sales Pipeline');
        setPipelineIds(prev => new Set([...prev, contract.id]));
      } else {
        toast.error('Failed to add to pipeline. Please try again.');
      }
    }
  }

  async function handlePromote(contract: ProspectedContract) {
    try {
      await api.post(`/prospected/${contract.id}/promote`);
      toast.success('Contract promoted to Active Tenders');
      fetchData();
    } catch {
      toast.error('Failed to promote contract. Please try again.');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/prospected/${deleteTarget.id}`);
      toast.success('Contract deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete contract. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  const columns: Column<ProspectedContract>[] = [
    {
      key: 'contract',
      header: 'Contract Name',
      width: 'flex',
      maxWidth: 320,
      render: row => <ContractCell row={row} />,
    },
    {
      key: 'source',
      header: 'Source',
      width: 100,
      render: row => <SourceCell row={row} />,
    },
    {
      key: 'created_at',
      header: 'Date Added',
      width: 130,
      mono: true,
      render: row => formatDate(row.created_at),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      width: 170,
      mono: true,
      render: row => <DeadlineCell row={row} />,
    },
    {
      key: 'added_by',
      header: 'Added By',
      width: 120,
      render: row => row.added_by_name,
    },
    {
      key: 'actions',
      header: '',
      width: 380,
      align: 'right',
      render: row => (
        <ActionsCell
          row={row}
          inPipeline={pipelineIds.has(row.id)}
          onAddToPipeline={handleAddToPipeline}
          onPromote={handlePromote}
          onDelete={r => setDeleteTarget(r)}
        />
      ),
    },
  ];

  const drawerFooter = (
    <>
      <Button variant="ghost" size="md" onClick={() => !saving && setPanelOpen(false)} disabled={saving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        loading={saving}
        type="submit"
      >
        Save contract
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Contracts Prospected"
        description="Fresh contract notices tracked before they enter the pipeline. Paste a Find a Tender URL to add one."
      />

      <div className="kpi-row">
        <KPITile
          label="Today"
          value={loading ? 0 : stats.today}
          icon={Calendar}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="This Week"
          value={loading ? 0 : stats.this_week}
          icon={CalendarDays}
          tone="info"
          loading={loading}
        />
        <KPITile
          label="Vlad"
          value={loading ? '0 / 10' : `${stats.vlad_today} / 10`}
          hint={`${stats.vlad_week} this week`}
          icon={User}
          tone="brand"
          loading={loading}
        />
        <KPITile
          label="Tristan"
          value={loading ? '0 / 10' : `${stats.tristan_today} / 10`}
          hint={`${stats.tristan_week} this week`}
          icon={User}
          tone="info"
          loading={loading}
        />
      </div>

      <div className="prospected-url-bar">
        <div style={{ flex: 1 }}>
          <Input
            placeholder="Paste a Find a Tender URL or add manually..."
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setDuplicateError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <Button
          variant="primary"
          size="md"
          icon={Plus}
          onClick={handleAdd}
          loading={extracting}
        >
          Add
        </Button>
      </div>

      {duplicateError && (
        <div className="prospected-error-banner" role="alert">
          {duplicateError}
        </div>
      )}

      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search contracts..."
        />
      </FilterBar>

      <DataTable<ProspectedContract>
        columns={columns}
        data={filtered}
        rowKey={r => String(r.id)}
        ariaLabel="Contracts prospected"
        isLoading={loading}
        isError={loadError}
        errorMessage="Couldn't load contracts"
        onRetry={fetchData}
        emptyState={{
          message:
            contracts.length === 0
              ? 'No contracts prospected yet. Paste a Find a Tender URL above to get started.'
              : 'No contracts match your search',
        }}
      />

      <Drawer
        open={panelOpen}
        onClose={() => { if (!saving) setPanelOpen(false); }}
        title={panelTitle}
        footer={drawerFooter}
      >
        <form onSubmit={handleSave} noValidate style={{ display: 'contents' }}>
          {extracting && (
            <div className="prospected-extract-banner" role="status">
              Extracting from Find a Tender...
            </div>
          )}

          <Input
            label="Contract name"
            required
            value={form.title}
            error={titleError ? 'Contract name is required' : undefined}
            onChange={e => updateForm('title', e.target.value)}
          />

          <Input
            label="URL"
            placeholder="https://..."
            value={form.url}
            onChange={e => updateForm('url', e.target.value)}
          />

          <Input
            label="Submission deadline"
            type="date"
            required
            value={form.submission_deadline}
            error={deadlineError ? 'Submission deadline is required' : undefined}
            hint={!deadlineError && deadlineHint ? deadlineHint : undefined}
            onChange={e => updateForm('submission_deadline', e.target.value)}
          />
        </form>
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Contract"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
