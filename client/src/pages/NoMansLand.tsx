import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  FileText,
  Pencil,
  RotateCcw,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react';
import api from '../lib/api';
import type { NoMansLandRow, Tender, PipelineProspect } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile } from '../components/KPITile/KPITile';
import { FilterBar } from '../components/FilterBar/FilterBar';
import { Select } from '../components/Select/Select';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { ReEngageDialog, type ReEngageTarget } from '../components/ReEngageDialog/ReEngageDialog';
import { TenderDrawer, type TenderFormValues, type TenderStatus, type TenderClientOption } from '../components/TenderDrawer/TenderDrawer';
import { ProspectDrawer, type ProspectFormValues, type ProspectStatus } from '../components/ProspectDrawer/ProspectDrawer';
import NotesPanel from '../components/NotesPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  DROP_REASON_OPTIONS,
  PROSPECT_STATUS_LABELS,
  TENDER_STATUS_LABELS,
  formatDate,
  getDropReasonLabel,
} from '../lib/format';

const STAGE_LABEL: Record<string, string> = {
  ...PROSPECT_STATUS_LABELS,
  ...TENDER_STATUS_LABELS,
};

function rowKey(row: NoMansLandRow): string {
  return `${row.source}-${row.id}`;
}

function tenderToFormFromServer(t: Tender): Partial<TenderFormValues> {
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

function prospectToFormFromServer(p: PipelineProspect): Partial<ProspectFormValues> {
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

export default function NoMansLand() {
  const { user } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState<NoMansLandRow[]>([]);
  const [clients, setClients] = useState<TenderClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);

  const [reEngageTarget, setReEngageTarget] = useState<NoMansLandRow | null>(null);
  const [notesTarget, setNotesTarget] = useState<NoMansLandRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoMansLandRow | null>(null);

  const [tenderDrawer, setTenderDrawer] = useState<{
    initial: Partial<TenderFormValues>;
    id: number;
  } | null>(null);
  const [prospectDrawer, setProspectDrawer] = useState<{
    initial: Partial<ProspectFormValues>;
    id: number;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (reasonFilter) params.reason = reasonFilter;
      if (sourceFilter) params.source = sourceFilter;
      const [listRes, clientsRes] = await Promise.all([
        api.get('/no-mans-land', { params }),
        api.get('/clients'),
      ]);
      setRows(listRes.data);
      setClients(
        (clientsRes.data as Array<{ id: number; company_name: string }>)
          .map(c => ({ id: c.id, name: c.company_name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, reasonFilter, sourceFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* KPI figures are computed from whatever rows are currently loaded.
   * /no-mans-land applies server-side filters (search / reason /
   * source), so when a filter is on the tiles reflect the filtered
   * subset - this matches the "here are the stats for what you are
   * looking at" pattern. A dedicated /no-mans-land/stats endpoint
   * would give full-population figures but is deliberately not added
   * yet (Re-engaged in last 30d would need the same endpoint since
   * that data lives in activity_log, and we skipped it here). */
  const kpis = useMemo(() => {
    const droppedTenders = rows.filter(r => r.source === 'tender').length;
    const droppedProspects = rows.filter(r => r.source === 'prospect').length;
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const droppedLast30d = rows.filter(r => {
      const t = new Date(r.dropped_at).getTime();
      return Number.isFinite(t) && t >= thirtyDaysAgoMs;
    }).length;
    const reasonCounts = rows.reduce<Record<string, number>>((acc, r) => {
      if (r.drop_reason) acc[r.drop_reason] = (acc[r.drop_reason] ?? 0) + 1;
      return acc;
    }, {});
    const topEntry = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
    const topReasonLabel = topEntry ? getDropReasonLabel(topEntry[0]) : '-';
    const topReasonCount = topEntry ? topEntry[1] : 0;
    return { droppedTenders, droppedProspects, droppedLast30d, topReasonLabel, topReasonCount };
  }, [rows]);

  const filtersActive = !!search || !!reasonFilter || !!sourceFilter;

  function clearFilters() {
    setSearch('');
    setReasonFilter(undefined);
    setSourceFilter(undefined);
  }

  /* ------------- Re-engage ------------- */

  async function handleReEngageConfirm(target: ReEngageTarget) {
    if (!reEngageTarget) return;
    const row = reEngageTarget;
    const name = row.company || row.tender_title || '#' + row.id;
    try {
      if (row.source === 'tender') {
        // Tenders only re-engage to Active Tenders.
        await api.post(`/tenders/${row.id}/re-engage`);
      } else {
        if (target === 'pipeline') {
          await api.post(`/pipeline/${row.id}/re-engage`);
        } else {
          // Prospect -> Active Tenders uses the existing /promote flow.
          await api.post(`/pipeline/${row.id}/promote`);
        }
      }
      toast.success(`${name} re-engaged`);
      setReEngageTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to re-engage. Please try again.');
    }
  }

  /* ------------- Edit ------------- */

  async function openEdit(row: NoMansLandRow) {
    try {
      if (row.source === 'tender') {
        const res = await api.get(`/tenders/${row.id}`);
        setTenderDrawer({ initial: tenderToFormFromServer(res.data), id: row.id });
      } else {
        const res = await api.get(`/pipeline/${row.id}`);
        setProspectDrawer({ initial: prospectToFormFromServer(res.data), id: row.id });
      }
    } catch {
      toast.error('Failed to load record. Please try again.');
    }
  }

  async function handleTenderSave(values: TenderFormValues) {
    if (!tenderDrawer) return;
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
      await api.put(`/tenders/${tenderDrawer.id}`, payload);
      toast.success('Tender updated');
      setTenderDrawer(null);
      fetchData();
    } catch {
      toast.error('Failed to update tender. Please try again.');
    }
  }

  async function handleProspectSave(values: ProspectFormValues) {
    if (!prospectDrawer) return;
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
      await api.put(`/pipeline/${prospectDrawer.id}`, payload);
      toast.success('Prospect updated');
      setProspectDrawer(null);
      fetchData();
    } catch {
      toast.error('Failed to update prospect. Please try again.');
    }
  }

  /* ------------- Delete ------------- */

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const name = target.company || target.tender_title || '#' + target.id;
    try {
      const path = target.source === 'tender' ? `/tenders/${target.id}` : `/pipeline/${target.id}`;
      await api.delete(path);
      toast.success(`${name} deleted`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete. Please try again.');
      setDeleteTarget(null);
    }
  }

  /* ------------- Render ------------- */

  const columns: Column<NoMansLandRow>[] = useMemo(() => [
    {
      key: 'company',
      header: 'Company',
      width: 'flex',
      maxWidth: 220,
      render: row =>
        row.company ? (
          <TruncatedText>{row.company}</TruncatedText>
        ) : (
          <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No client</span>
        ),
    },
    {
      key: 'contact',
      header: 'Contact',
      width: 140,
      maxWidth: 140,
      render: row =>
        row.contact ? (
          <TruncatedText>{row.contact}</TruncatedText>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        ),
    },
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      maxWidth: 280,
      render: row =>
        row.tender_title ? (
          <TruncatedText>{row.tender_title}</TruncatedText>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        ),
    },
    {
      key: 'stage',
      header: 'Stage when dropped',
      width: 160,
      render: row => (
        <Badge variant="neutral">
          {STAGE_LABEL[row.stage_when_dropped] ?? row.stage_when_dropped}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Drop reason',
      width: 180,
      render: row => (
        <span title={row.drop_note ?? undefined}>
          {row.drop_reason ? getDropReasonLabel(row.drop_reason) : '-'}
        </span>
      ),
    },
    {
      key: 'dropped_at',
      header: 'Dropped',
      width: 110,
      mono: true,
      align: 'right',
      render: row => formatDate(row.dropped_at),
    },
    {
      key: 'last_contact',
      header: 'Last contact',
      width: 110,
      mono: true,
      align: 'right',
      render: row => row.last_contact ? formatDate(row.last_contact) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>,
    },
    {
      key: 'source',
      header: 'Source',
      width: 110,
      render: row => (
        <Badge variant={row.source === 'tender' ? 'info' : 'brand'}>
          {row.source === 'tender' ? 'Tender' : 'Prospect'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 380,
      align: 'right',
      render: row => (
        <span
          className="dt-actions"
          onClick={e => e.stopPropagation()}
          style={{ display: 'inline-flex', gap: 6 }}
        >
          <Button
            variant="primary"
            size="sm"
            icon={RotateCcw}
            onClick={() => setReEngageTarget(row)}
          >
            Re-engage
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={StickyNote}
            onClick={() => setNotesTarget(row)}
          >
            Notes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Pencil}
            onClick={() => openEdit(row)}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => setDeleteTarget(row)}
          >
            Delete
          </Button>
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <>
      <PageHeader
        title="No Man's Land"
        description="Tenders and prospects on pause. Re-engage when a fresh opportunity fits."
      />

      <div className="kpi-row">
        <KPITile
          label="Dropped Tenders"
          value={loading ? 0 : kpis.droppedTenders}
          icon={FileText}
          tone="neutral"
          loading={loading}
        />
        <KPITile
          label="Dropped Prospects"
          value={loading ? 0 : kpis.droppedProspects}
          icon={Users}
          tone="neutral"
          loading={loading}
        />
        <KPITile
          label="Dropped Last 30d"
          value={loading ? 0 : kpis.droppedLast30d}
          icon={Clock}
          tone="warning"
          loading={loading}
        />
        <KPITile
          label="Most Common Reason"
          value={loading ? '-' : kpis.topReasonLabel}
          hint={
            !loading && kpis.topReasonCount > 0
              ? `${kpis.topReasonCount} ${kpis.topReasonCount === 1 ? 'row' : 'rows'}`
              : undefined
          }
          icon={AlertCircle}
          tone="neutral"
          loading={loading}
        />
      </div>

      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search company, contact, tender..."
        />
        <Select
          value={reasonFilter ?? 'all'}
          onValueChange={v => setReasonFilter(v === 'all' ? undefined : v)}
          placeholder="All reasons"
          width={200}
          ariaLabel="Filter by drop reason"
          options={[
            { value: 'all', label: 'All reasons' },
            ...DROP_REASON_OPTIONS,
          ]}
        />
        <Select
          value={sourceFilter ?? 'all'}
          onValueChange={v => setSourceFilter(v === 'all' ? undefined : v)}
          placeholder="All sources"
          width={180}
          ariaLabel="Filter by source"
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'tender', label: 'Tenders only' },
            { value: 'prospect', label: 'Prospects only' },
          ]}
        />
        {filtersActive && <FilterBar.Clear onClick={clearFilters} />}
      </FilterBar>

      <DataTable<NoMansLandRow>
        columns={columns}
        data={rows}
        rowKey={rowKey}
        ariaLabel="No Man's Land"
        isLoading={loading}
        isError={loadError}
        errorMessage="Couldn't load No Man's Land"
        onRetry={fetchData}
        emptyState={{
          message: filtersActive
            ? 'No dropped items match these filters'
            : 'No Man\'s Land is empty',
          action: filtersActive
            ? { label: 'Clear filters', onClick: clearFilters }
            : undefined,
        }}
      />

      <ReEngageDialog
        open={reEngageTarget !== null}
        source={reEngageTarget?.source ?? 'tender'}
        entityName={
          reEngageTarget
            ? (reEngageTarget.company || reEngageTarget.tender_title || `#${reEngageTarget.id}`)
            : ''
        }
        onClose={() => setReEngageTarget(null)}
        onConfirm={handleReEngageConfirm}
      />

      <NotesPanel
        isOpen={notesTarget !== null}
        onClose={() => {
          setNotesTarget(null);
          fetchData();
        }}
        title={
          notesTarget
            ? `${notesTarget.company || notesTarget.tender_title || '#' + notesTarget.id} - Notes`
            : ''
        }
        entityType={notesTarget?.source === 'tender' ? 'tender' : 'pipeline'}
        entityId={notesTarget?.id ?? null}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete permanently?"
        message={
          deleteTarget
            ? `${deleteTarget.company || deleteTarget.tender_title || 'This row'} will be removed entirely. This cannot be undone. (Re-engage instead if you might pick it back up.)`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <TenderDrawer
        open={tenderDrawer !== null}
        onClose={() => setTenderDrawer(null)}
        initial={tenderDrawer?.initial ?? null}
        clients={clients}
        defaultAssignee={user?.name ?? ''}
        onSave={handleTenderSave}
      />

      <ProspectDrawer
        open={prospectDrawer !== null}
        onClose={() => setProspectDrawer(null)}
        initial={prospectDrawer?.initial ?? null}
        defaultAssignee={user?.name ?? ''}
        onSave={handleProspectSave}
      />
    </>
  );
}
