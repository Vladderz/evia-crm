import { useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  FileText,
  Pencil,
  Plus,
  Send,
  StickyNote,
  Target,
  Trophy,
} from 'lucide-react';
import { AppShell } from '../components/AppShell/AppShell';
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
import { Input } from '../components/Input/Input';
import { Textarea } from '../components/Textarea/Textarea';
import { Select } from '../components/Select/Select';
import { Modal } from '../components/Modal/Modal';
import {
  TenderDrawer,
  type TenderFormValues,
  type TenderStatus,
} from '../components/TenderDrawer/TenderDrawer';
import {
  formatCurrency,
  formatDate,
  formatRelativeDays,
  getStatusLabel,
} from '../lib/format';

/* -----------------------------------------------------------------
 * Mock data
 * ----------------------------------------------------------------- */

interface MockTender {
  id: string;
  title: string;
  reference: string;
  client: string;
  value: number | null;
  fee: number | null;
  submission_deadline: string;
  award_date: string;
  status: TenderStatus;
  assigned_to: 'vlad' | 'tristan' | null;
  awaiting_info?: boolean;
  awaiting_info_note?: string;
}

const MOCK_TENDERS: MockTender[] = [
  {
    id: 't1',
    title:
      'Maintenance and Servicing of HVAC Systems Across Multiple Council Properties Including Schools and Community Care Homes',
    reference: 'SKDC-1629',
    client: 'South Kesteven DC',
    value: 248000,
    fee: 18600,
    submission_deadline: '2026-05-22',
    award_date: '2026-06-15',
    status: 'writing',
    assigned_to: 'vlad',
    awaiting_info: true,
    awaiting_info_note: 'Waiting on TUPE staff list from current provider',
  },
  {
    id: 't2',
    title: 'Grounds maintenance framework',
    reference: 'NPDC-0418',
    client: 'North Powys CC',
    value: 92000,
    fee: 6900,
    submission_deadline: '2026-04-18',
    award_date: '2026-04-25',
    status: 'writing',
    assigned_to: 'tristan',
  },
  {
    id: 't3',
    title: 'Cleaning services - secondary schools',
    reference: 'BSE-2210',
    client: 'Borough of St Edmunds',
    value: 185000,
    fee: 13875,
    submission_deadline: '2026-04-30',
    award_date: '2026-05-14',
    status: 'submitted',
    assigned_to: 'vlad',
  },
  {
    id: 't4',
    title: 'Highway gully cleansing',
    reference: 'WMBC-0096',
    client: 'Wirral MBC',
    value: 410000,
    fee: 30750,
    submission_deadline: '2026-05-09',
    award_date: '2026-07-02',
    status: 'submitted',
    assigned_to: 'tristan',
  },
  {
    id: 't5',
    title: 'Catering equipment supply and installation',
    reference: 'NHS-7741',
    client: 'NHS Greater Manchester',
    value: 1240000,
    fee: 62000,
    submission_deadline: '2026-06-04',
    award_date: '2026-08-01',
    status: 'questionnaire_sent',
    assigned_to: 'vlad',
  },
  {
    id: 't6',
    title: 'Asbestos surveys',
    reference: '018892-2026',
    client: 'TBC',
    value: null,
    fee: null,
    submission_deadline: '2026-06-12',
    award_date: '2026-08-22',
    status: 'questionnaire_sent',
    assigned_to: 'tristan',
  },
  {
    id: 't7',
    title: 'Reactive plumbing repairs',
    reference: 'CCC-3320',
    client: 'Cardiff Council',
    value: 320000,
    fee: 24000,
    submission_deadline: '2026-03-10',
    award_date: '2026-04-10',
    status: 'won',
    assigned_to: 'vlad',
  },
  {
    id: 't8',
    title: 'Window cleaning services',
    reference: 'LBC-1188',
    client: 'Lambeth BC',
    value: 78000,
    fee: 5850,
    submission_deadline: '2026-02-28',
    award_date: '2026-03-22',
    status: 'lost',
    assigned_to: null,
  },
  {
    id: 't9',
    title: 'School catering contract refresh',
    reference: 'EYC-2024',
    client: 'East Yorkshire CC',
    value: 2150000,
    fee: 96750,
    submission_deadline: '2026-01-20',
    award_date: '2026-02-15',
    status: 'won',
    assigned_to: 'tristan',
  },
];

/* -----------------------------------------------------------------
 * Status -> Badge variant
 * ----------------------------------------------------------------- */
const STATUS_VARIANT: Record<TenderStatus, BadgeVariant> = {
  writing: 'warning',
  submitted: 'info',
  questionnaire_sent: 'neutral',
  won: 'success',
  lost: 'danger',
  archived: 'neutral',
};

const STATUS_HAS_DOT: Record<TenderStatus, boolean> = {
  writing: true,
  submitted: true,
  questionnaire_sent: true,
  won: false,
  lost: false,
  archived: false,
};

const ASSIGNED_LABEL: Record<string, string> = {
  vlad: 'Vlad',
  tristan: 'Tristan',
};

/* -----------------------------------------------------------------
 * Cell renderers
 * ----------------------------------------------------------------- */

function TenderCell({ row }: { row: MockTender }) {
  return (
    <div className="dt-cell-2line">
      <span className="dt-cell-primary">
        <TruncatedText>{row.title}</TruncatedText>
      </span>
      <span className="dt-cell-secondary">{row.reference}</span>
    </div>
  );
}

function StatusCell({ row }: { row: MockTender }) {
  const showAwaiting = row.status === 'writing' && row.awaiting_info === true;
  const awaitingTooltip = row.awaiting_info_note?.trim() || 'Waiting on client input';
  return (
    <div className="status-stack">
      <Badge variant={STATUS_VARIANT[row.status]} withDot={STATUS_HAS_DOT[row.status]}>
        {getStatusLabel(row.status)}
      </Badge>
      {showAwaiting && (
        <span title={awaitingTooltip}>
          <Badge variant="warning" withDot>Awaiting Info</Badge>
        </span>
      )}
    </div>
  );
}

function ValueCell({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  return <>{formatCurrency(value)}</>;
}

function AwardCell({ row }: { row: MockTender }) {
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

function AssignedCell({ row }: { row: MockTender }) {
  if (!row.assigned_to) {
    return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  }
  const label = ASSIGNED_LABEL[row.assigned_to] ?? row.assigned_to;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Avatar name={label} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </span>
  );
}

function ActionsCell({
  row,
  onEdit,
}: {
  row: MockTender;
  onEdit: (row: MockTender) => void;
}) {
  const showMarkWon = row.status === 'submitted';
  return (
    <span className="dt-actions" onClick={e => e.stopPropagation()}>
      <button type="button" className="dt-action dt-action-ghost">
        <StickyNote size={12} aria-hidden /> Notes
      </button>
      {showMarkWon ? (
        <button type="button" className="dt-action dt-action-primary">
          <Check size={12} aria-hidden /> Mark Won
        </button>
      ) : (
        <button
          type="button"
          className="dt-action dt-action-ghost"
          onClick={() => onEdit(row)}
        >
          <Pencil size={12} aria-hidden /> Edit
        </button>
      )}
    </span>
  );
}

/* -----------------------------------------------------------------
 * Expand panel
 * ----------------------------------------------------------------- */

function ExpandPanel({ row }: { row: MockTender }) {
  return (
    <div className="dt-expand-grid">
      <div>
        <div className="dt-expand-section-title">Activity Timeline</div>
        <div className="dt-expand-timeline">
          <div className="dt-expand-timeline-item">
            <span className="dt-expand-timeline-date">{formatDate('2026-05-02')}</span>
            <span>Status changed from Questionnaire Sent to Writing</span>
          </div>
          <div className="dt-expand-timeline-item">
            <span className="dt-expand-timeline-date">{formatDate('2026-04-28')}</span>
            <span>Tender assigned to Vlad</span>
          </div>
          <div className="dt-expand-timeline-item">
            <span className="dt-expand-timeline-date">{formatDate('2026-04-22')}</span>
            <span>Estimated value updated to {formatCurrency(row.value ?? 0)}</span>
          </div>
          <div className="dt-expand-timeline-item">
            <span className="dt-expand-timeline-date">{formatDate('2026-04-15')}</span>
            <span>Tender created</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="dt-action dt-action-link">Show more</button>
          </div>
        </div>
      </div>

      <div>
        <div className="dt-expand-section-title">Notes</div>
        <div className="dt-expand-note">
          <div className="dt-expand-note-meta">
            <strong style={{ color: 'var(--text-secondary-v1)' }}>Vlad</strong> · {formatDate('2026-05-01')}
          </div>
          Got the spec doc through. Their TUPE position is the trickiest part - existing
          provider has 4 staff on legacy contracts.
        </div>
        <div className="dt-expand-note">
          <div className="dt-expand-note-meta">
            <strong style={{ color: 'var(--text-secondary-v1)' }}>Tristan</strong> · {formatDate('2026-04-26')}
          </div>
          Spoke to Sarah - they want a single-page case study on the Cardiff job included
          as appendix. Will pull from the won portfolio.
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="dt-action dt-action-link">View all notes</button>
        </div>
      </div>

      <div>
        <div className="dt-expand-section-title">Quick Actions</div>
        <div className="dt-expand-actions">
          <Button variant="secondary" size="sm" icon={Send}>Mark as submitted</Button>
          <Button variant="secondary" size="sm" icon={Pencil}>Edit tender</Button>
          <Button variant="secondary" size="sm" icon={StickyNote}>Add note</Button>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * Columns
 * ----------------------------------------------------------------- */

function buildColumns(onEdit: (row: MockTender) => void): Column<MockTender>[] {
  return [
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
      render: row => <TruncatedText>{row.client}</TruncatedText>,
    },
    {
      key: 'value',
      header: 'Value',
      width: 100,
      align: 'right',
      mono: true,
      render: row => <ValueCell value={row.value} />,
    },
    {
      key: 'fee',
      header: 'Fee',
      width: 90,
      align: 'right',
      mono: true,
      render: row => <ValueCell value={row.fee} />,
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
      render: row => <AwardCell row={row} />,
    },
    {
      key: 'assigned',
      header: 'Assigned',
      width: 100,
      render: row => <AssignedCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 170,
      align: 'right',
      render: row => <ActionsCell row={row} onEdit={onEdit} />,
    },
  ];
}

/* -----------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------- */

function tenderToForm(t: MockTender): Partial<TenderFormValues> {
  return {
    title: t.title,
    tender_url: '',
    buyer: '',
    estimated_value: t.value != null ? String(t.value) : '',
    evia_fee: t.fee != null ? String(t.fee) : '',
    submission_deadline: t.submission_deadline ? `${t.submission_deadline}T09:00` : '',
    award_date: t.award_date ?? '',
    portal: '',
    reference_number: t.reference,
    sector: '',
    client_id: '',
    status: t.status,
    awaiting_info: t.awaiting_info ?? false,
    awaiting_info_note: t.awaiting_info_note ?? '',
    assigned_to:
      t.assigned_to === 'vlad'
        ? 'Vlad'
        : t.assigned_to === 'tristan'
          ? 'Tristan'
          : '',
    notes: '',
  };
}

const STAGE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'questionnaire_sent', label: 'Questionnaire Sent' },
  { key: 'writing', label: 'Writing' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function Playground() {
  const [stage, setStage] = useState<string>('questionnaire_sent');
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>('t1');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerInitial, setDrawerInitial] = useState<Partial<TenderFormValues> | null | undefined>(
    undefined,
  );

  const drawerOpen = drawerInitial !== undefined;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const t of MOCK_TENDERS) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      // "All" means all currently-active stages, matching the
      // Active Tenders KPI tile. Won/Lost/Archived live in their
      // own tabs and are not part of the All count.
      if (t.status !== 'won' && t.status !== 'lost' && t.status !== 'archived') {
        c.all = (c.all ?? 0) + 1;
      }
    }
    return c;
  }, []);

  /* KPI strip values, computed from the mock dataset. */
  const stats = useMemo(() => {
    const isPipeline = (t: MockTender) =>
      t.status !== 'won' && t.status !== 'lost' && t.status !== 'archived';
    const active = MOCK_TENDERS.filter(isPipeline).length;
    const submitted = MOCK_TENDERS.filter(t => t.status === 'submitted').length;
    const won = MOCK_TENDERS.filter(t => t.status === 'won');
    const lost = MOCK_TENDERS.filter(t => t.status === 'lost');
    const wonValue = won.reduce((s, t) => s + (t.value ?? 0), 0);
    const wonFees = won.reduce((s, t) => s + (t.fee ?? 0), 0);
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : 0;
    return {
      active,
      submitted,
      wonValue,
      wonFees,
      wonCount: won.length,
      decided,
      winRate,
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK_TENDERS.filter(t => {
      if (stage === 'all') {
        // "All" = active stages only, matching the Active Tenders KPI tile.
        if (t.status === 'won' || t.status === 'lost' || t.status === 'archived') {
          return false;
        }
      } else if (t.status !== stage) {
        return false;
      }
      if (assigned && t.assigned_to !== assigned) return false;
      if (q) {
        const hay = `${t.title} ${t.client} ${t.reference}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stage, search, assigned]);

  const tabsWithCount = STAGE_TABS.map(t => ({ ...t, count: counts[t.key] ?? 0 }));

  function clearFilters() {
    setSearch('');
    setAssigned(undefined);
  }

  function toggleExpand(row: MockTender) {
    setExpandedId(curr => (curr === row.id ? null : row.id));
  }

  function openAdd() {
    setDrawerInitial(null);
  }

  function openEdit(row: MockTender) {
    setDrawerInitial(tenderToForm(row));
  }

  function closeDrawer() {
    setDrawerInitial(undefined);
  }

  const filtersActive = !!search || !!assigned;
  const columns = useMemo(() => buildColumns(openEdit), []);

  return (
    <AppShell user={{ name: 'Vlad Lewis', onLogout: () => {} }} sidebarActiveKey="tenders">
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
          value={stats.active}
          icon={FileText}
          tone="brand"
        />
        <KPITile
          label="Submitted"
          value={stats.submitted}
          icon={Send}
          tone="info"
        />
        <KPITile
          label="Won Value"
          value={formatCurrency(stats.wonValue)}
          icon={Trophy}
          tone="success"
          mono
        />
        <KPITile
          label="Won Fees"
          value={formatCurrency(stats.wonFees)}
          icon={Banknote}
          tone="success"
          mono
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
            { value: 'vlad', label: 'Vlad' },
            { value: 'tristan', label: 'Tristan' },
          ]}
        />
        {filtersActive && <FilterBar.Clear onClick={clearFilters} />}
      </FilterBar>

      <DataTable<MockTender>
        columns={columns}
        data={filtered}
        rowKey={r => r.id}
        variant="attached"
        ariaLabel="Active tenders"
        onRowClick={toggleExpand}
        expandedRow={{ rowId: expandedId, render: row => <ExpandPanel row={row} /> }}
        emptyState={{
          message: 'No tenders match these filters',
          action: { label: 'Clear filters', onClick: clearFilters },
        }}
      />

      <TenderDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initial={drawerInitial ?? null}
        defaultAssignee="Vlad"
        onSave={async () => {
          // Playground demo - just close. Real save happens in Step 4.
          closeDrawer();
        }}
      />

      {/* ============================================================
           Secondary demos (playground-only, scoped to /playground)
           ============================================================ */}

      <section className="pg-section" style={{ marginTop: 48 }}>
        <h2 className="pg-section-title">DataTable - loading state</h2>
        <DataTable<MockTender>
          columns={columns}
          data={[]}
          rowKey={r => r.id}
          isLoading
          ariaLabel="Loading state"
        />
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">DataTable - error state</h2>
        <DataTable<MockTender>
          columns={columns}
          data={[]}
          rowKey={r => r.id}
          isError
          errorMessage="Couldn't load tenders"
          onRetry={() => {}}
          ariaLabel="Error state"
        />
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">Drawer demos</h2>
        <p className="pg-section-note">
          Add Tender (empty) and Edit Tender (pre-filled with row t1, which has Awaiting
          Info on). The page header "+ Add Tender" button and the row Edit buttons open
          the same drawer.
        </p>
        <div className="pg-row">
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Open Add Tender
          </Button>
          <Button
            variant="secondary"
            icon={Pencil}
            onClick={() => openEdit(MOCK_TENDERS[0]!)}
          >
            Open Edit Tender (Writing + Awaiting Info)
          </Button>
        </div>
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">Form primitives</h2>
        <div className="pg-grid-2">
          <Input
            label="Tender title"
            placeholder="e.g. School cleaning framework"
            hint="Shown in lists and detail panels"
            required
          />
          <Input
            label="Reference code"
            error="A reference is required"
            defaultValue=""
          />
          <Select
            label="Sector"
            placeholder="Choose a sector"
            options={[
              { value: 'health', label: 'Health' },
              { value: 'education', label: 'Education' },
              { value: 'local', label: 'Local Authority' },
              { value: 'social', label: 'Social Housing' },
            ]}
            onValueChange={() => {}}
          />
          <Input label="Estimated value" placeholder="£0" />
        </div>
        <div style={{ marginTop: 16 }}>
          <Textarea
            label="Notes"
            placeholder="Anything you want to remember about this tender..."
            rows={3}
            hint="Plain text, no formatting needed"
          />
        </div>
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">Modal</h2>
        <p className="pg-section-note">
          Centred Radix Dialog (used for confirmations). The drawer above is the
          right-side variant for forms.
        </p>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Drop this prospect?"
          description="They will be removed from the active sales pipeline. You can restore them from the archive later."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Drop prospect
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary-v1)', lineHeight: 1.5 }}>
            This action will be logged in the activity timeline so you can see when and
            why the prospect was dropped.
          </p>
        </Modal>
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">Badge variants</h2>
        <div className="pg-row">
          <Badge variant="warning" size="md" withDot>Writing</Badge>
          <Badge variant="warning" size="md" withDot>Awaiting Info</Badge>
          <Badge variant="info" size="md" withDot>Submitted</Badge>
          <Badge variant="neutral" size="md" withDot>Questionnaire Sent</Badge>
          <Badge variant="brand" size="md" withDot>Summary Sent</Badge>
          <Badge variant="success" size="md">Won</Badge>
          <Badge variant="danger" size="md">Lost</Badge>
        </div>
      </section>

      <section className="pg-section" style={{ paddingBottom: 48 }}>
        <h2 className="pg-section-title">Button variants</h2>
        <div className="pg-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="pg-row">
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
        </div>
        <div className="pg-row">
          <Button variant="primary" icon={Plus}>Add Tender</Button>
          <Button variant="primary" icon={Check}>Mark Won</Button>
          <Button variant="secondary" icon={Pencil}>Edit</Button>
          <Button variant="primary" icon={Send} iconPosition="right">Send</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </section>
    </AppShell>
  );
}
