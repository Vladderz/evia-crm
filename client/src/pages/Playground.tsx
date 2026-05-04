import { useState } from 'react';
import { Check, Pencil, Send, StickyNote } from 'lucide-react';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import { Badge, type BadgeVariant } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Avatar } from '../components/Avatar/Avatar';
import {
  formatCurrency,
  formatDate,
  formatRelativeDays,
  getStatusLabel,
} from '../lib/format';

/* -----------------------------------------------------------------
 * Mock tender shape - mirrors a subset of the real Tender type so
 * the playground exercises the same column patterns the real page
 * will use.
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
  status: 'writing' | 'submitted' | 'questionnaire_sent' | 'won' | 'lost';
  assigned_to: 'vlad' | 'tristan' | null;
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
 * Status -> Badge variant mapping (mirrors brief section 5.1)
 * ----------------------------------------------------------------- */
const STATUS_VARIANT: Record<MockTender['status'], BadgeVariant> = {
  writing: 'warning',
  submitted: 'info',
  questionnaire_sent: 'neutral',
  won: 'success',
  lost: 'danger',
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
  return (
    <Badge variant={STATUS_VARIANT[row.status]}>{getStatusLabel(row.status)}</Badge>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Avatar name={label} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </span>
  );
}

function ActionsCell({ row }: { row: MockTender }) {
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
        <button type="button" className="dt-action dt-action-ghost">
          <Pencil size={12} aria-hidden /> Edit
        </button>
      )}
    </span>
  );
}

/* -----------------------------------------------------------------
 * Expand panel renderer (mock activity / notes / quick actions)
 * ----------------------------------------------------------------- */

function ExpandPanel({ row }: { row: MockTender }) {
  return (
    <div className="dt-expand-grid">
      <div>
        <div className="dt-expand-section-title">Activity Timeline</div>
        <div className="dt-expand-timeline">
          <div className="dt-expand-timeline-item">
            <span className="dt-expand-timeline-date">{formatDate('2026-05-02')}</span>
            <span>Status changed from PSQ Stage to Writing</span>
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
 * Column config (Active Tenders / Live Pipeline view)
 * ----------------------------------------------------------------- */

function buildColumns(): Column<MockTender>[] {
  return [
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      maxWidth: 320,
      render: row => <TenderCell row={row} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 180,
      render: row => <StatusCell row={row} />,
    },
    {
      key: 'client',
      header: 'Client',
      width: 120,
      maxWidth: 120,
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
      width: 80,
      align: 'right',
      mono: true,
      render: row => <ValueCell value={row.fee} />,
    },
    {
      key: 'submission',
      header: 'Submission',
      width: 100,
      mono: true,
      render: row => formatDate(row.submission_deadline),
    },
    {
      key: 'award',
      header: 'Award',
      width: 130,
      mono: true,
      render: row => <AwardCell row={row} />,
    },
    {
      key: 'assigned',
      header: 'Assigned',
      width: 90,
      render: row => <AssignedCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 180,
      align: 'right',
      render: row => <ActionsCell row={row} />,
    },
  ];
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function Playground() {
  const columns = buildColumns();
  const [expandedId, setExpandedId] = useState<string | null>('t1');

  function toggleExpand(row: MockTender) {
    setExpandedId(curr => (curr === row.id ? null : row.id));
  }

  return (
    <div className="pg-page">
      <div className="pg-container">
        <header className="pg-header">
          <h1 className="pg-title">Component Playground</h1>
          <p className="pg-subtitle">
            Dev-only sandbox for v1 design-system primitives. Mounted at /playground when
            running Vite in development.
          </p>
        </header>

        <section className="pg-section">
          <h2 className="pg-section-title">DataTable - populated</h2>
          <p className="pg-section-note">
            Active Tenders columns. Row 1 has a deliberately long title (truncation +
            tooltip on hover) and is pre-expanded to demonstrate the row-expand panel.
            Row 2 has an overdue award date, row 3 has a within-14-days countdown.
          </p>
          <DataTable<MockTender>
            columns={columns}
            data={MOCK_TENDERS}
            rowKey={r => r.id}
            ariaLabel="Active tenders demo"
            onRowClick={toggleExpand}
            expandedRow={{ rowId: expandedId, render: row => <ExpandPanel row={row} /> }}
          />
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">DataTable - loading</h2>
          <DataTable<MockTender>
            columns={columns}
            data={[]}
            rowKey={r => r.id}
            isLoading
            ariaLabel="Loading state demo"
          />
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">DataTable - empty</h2>
          <DataTable<MockTender>
            columns={columns}
            data={[]}
            rowKey={r => r.id}
            ariaLabel="Empty state demo"
            emptyState={{
              message: 'No tenders match these filters',
              action: { label: 'Clear filters', onClick: () => {} },
            }}
          />
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">DataTable - error</h2>
          <DataTable<MockTender>
            columns={columns}
            data={[]}
            rowKey={r => r.id}
            isError
            errorMessage="Could not load tenders"
            onRetry={() => {}}
            ariaLabel="Error state demo"
          />
        </section>

        <section className="pg-section">
          <h2 className="pg-section-title">Badge variants</h2>
          <div className="pg-row">
            <Badge variant="success">Won</Badge>
            <Badge variant="warning">Writing</Badge>
            <Badge variant="danger">Lost</Badge>
            <Badge variant="info">Submitted / Awaiting Result</Badge>
            <Badge variant="brand">Summary Sent</Badge>
            <Badge variant="neutral">PSQ Stage</Badge>
          </div>
          <div className="pg-row">
            <Badge variant="success" size="md">Won</Badge>
            <Badge variant="warning" size="md">Writing</Badge>
            <Badge variant="danger" size="md">Lost</Badge>
            <Badge variant="brand" size="md">Summary Sent</Badge>
          </div>
        </section>

        <section className="pg-section">
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
            <Button variant="primary" icon={Check}>Mark Won</Button>
            <Button variant="secondary" icon={Pencil}>Edit</Button>
            <Button variant="primary" icon={Send} iconPosition="right">Send</Button>
            <Button variant="primary" loading>Saving</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </section>
      </div>
    </div>
  );
}
