import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  Receipt,
  Send,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import api from '../lib/api';
import type {
  Client,
  Invoice,
  InvoiceCategory,
  ProcurementType,
  Tender,
  ToInvoiceTender,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { KPITile, type KPITileTone } from '../components/KPITile/KPITile';
import { StageTabs } from '../components/StageTabs/StageTabs';
import { FilterBar } from '../components/FilterBar/FilterBar';
import { Select } from '../components/Select/Select';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import {
  DataTable,
  TruncatedText,
  type Column,
} from '../components/DataTable/DataTable';
import {
  InvoiceDrawer,
  type InvoiceFormValues,
  type MarkSentSource,
  type TenderPickerOption,
} from '../components/InvoiceDrawer/InvoiceDrawer';
import { MarkPaidDialog } from '../components/MarkPaidDialog/MarkPaidDialog';
import { VoidInvoiceDialog } from '../components/VoidInvoiceDialog/VoidInvoiceDialog';
import {
  INVOICE_CATEGORY_LABELS,
  addDaysYmd,
  currentMonthKeyLondon,
  formatDate,
  formatMonthLongYear,
  formatMonthShort,
  formatMoney,
  monthKeyOf,
  monthKeyRange,
  todayLondon,
} from '../lib/format';

// VAT registration threshold. Rate as of 2026; sanity-check
// https://www.gov.uk/vat-registration/when-to-register each tax year
// as HMRC has raised it several times in the past decade.
const VAT_THRESHOLD = 90000;

type TabKey = 'to_invoice' | 'awaiting' | 'paid' | 'by_month' | 'void';

interface DrawerState {
  mode: 'add' | 'mark_sent' | 'edit';
  source?: MarkSentSource;
  invoice?: Invoice;
}

/* ---------------- helpers ---------------- */

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function shortMonthLabel(monthKey: string): string {
  return formatMonthShort(monthKey);
}

function daysWord(n: number): string {
  return n === 1 ? '1 Day' : `${n} Days`;
}

function pluralPayments(n: number): string {
  return n === 1 ? '1 payment' : `${n} payments`;
}

/* ---------------- cell renderers ---------------- */

function TenderCell({ row }: { row: ToInvoiceTender }) {
  const badgeLabel: string | null =
    row.procurement_type === 'dps' ? 'DPS' :
    row.procurement_type === 'framework' ? 'Framework' :
    null;
  return (
    <div className="dt-cell-2line">
      <span className="dt-cell-primary">
        <TruncatedText>{row.title}</TruncatedText>
      </span>
      <span
        className="dt-cell-secondary dt-cell-secondary-sans"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {row.client_name ?? 'No client'}
        {badgeLabel && <Badge variant="neutral" size="sm">{badgeLabel}</Badge>}
      </span>
    </div>
  );
}

function InvoiceIdentityCell({ row }: { row: Invoice }) {
  return (
    <div className="dt-cell-2line">
      <span className="dt-cell-primary">
        <TruncatedText>
          {`${row.invoice_number ?? '(no number)'} - ${row.description}`}
        </TruncatedText>
      </span>
      <span className="dt-cell-secondary dt-cell-secondary-sans">
        {row.client_name} - {INVOICE_CATEGORY_LABELS[row.category] ?? row.category}
      </span>
    </div>
  );
}

function AwaitingStatusBadge({ row }: { row: Invoice }) {
  if (row.state === 'overdue') {
    const n = row.days_overdue ?? 0;
    return <Badge variant="danger" withDot>{`Overdue ${daysWord(n)}`}</Badge>;
  }
  const untilDue = row.days_until_due;
  if (untilDue === 0) return <Badge variant="warning" withDot>Due Today</Badge>;
  if (untilDue == null) return <Badge variant="neutral">No Due Date</Badge>;
  return <Badge variant="neutral">{`Due in ${daysWord(untilDue)}`}</Badge>;
}

/* ---------------- page ---------------- */

export default function Income() {
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [toInvoice, setToInvoice] = useState<ToInvoiceTender[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [nextNumber, setNextNumber] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState<TabKey>('to_invoice');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Invoice | null>(null);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [drawerSubmitError, setDrawerSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [invRes, toInvRes, tenRes, cliRes, nextRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/invoices/to-invoice'),
        api.get('/tenders'),
        api.get('/clients'),
        api.get('/invoices/next-number'),
      ]);
      setInvoices(invRes.data);
      setToInvoice(toInvRes.data);
      setTenders(tenRes.data);
      setClients(
        (cliRes.data as Client[]).sort((a, b) =>
          a.company_name.localeCompare(b.company_name),
        ),
      );
      setNextNumber(nextRes.data?.next);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------- URL month state ---------------- */

  const monthParam = searchParams.get('month');
  const currentMonth = currentMonthKeyLondon();
  const month: string =
    monthParam === 'all' ? 'all'
      : monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam
      : currentMonth;

  function setMonth(next: string) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === currentMonth) params.delete('month');
      else params.set('month', next);
      return params;
    }, { replace: true });
  }

  /* ---------------- month picker options ---------------- */

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const inv of invoices) {
      const issued = monthKeyOf(inv.issue_date);
      const paid = monthKeyOf(inv.paid_date);
      if (issued) keys.add(issued);
      if (paid) keys.add(paid);
    }
    keys.add(currentMonth);
    let min = currentMonth;
    keys.forEach(k => { if (k < min) min = k; });
    const range = monthKeyRange(min, currentMonth);
    const opts = [{ value: 'all', label: 'All Time' }];
    for (const k of [...range].reverse()) {
      opts.push({ value: k, label: formatMonthLongYear(k) });
    }
    return opts;
  }, [invoices, currentMonth]);

  /* ---------------- derived data ---------------- */

  const nonVoid = useMemo(() => invoices.filter(i => i.state !== 'void'), [invoices]);
  const voided = useMemo(() => invoices.filter(i => i.state === 'void'), [invoices]);

  const invoicedThisMonth = useMemo(
    () => nonVoid.filter(i => month === 'all' || monthKeyOf(i.issue_date) === month),
    [nonVoid, month],
  );
  const paidThisMonth = useMemo(
    () => nonVoid.filter(i => i.paid_date && (month === 'all' || monthKeyOf(i.paid_date) === month)),
    [nonVoid, month],
  );

  const outstanding = useMemo(
    () => nonVoid.filter(i => !i.paid_date),
    [nonVoid],
  );
  const overdueCount = outstanding.filter(i => i.state === 'overdue').length;

  /* KPI numbers */

  const invoicedTotal = invoicedThisMonth.reduce((s, i) => s + toNum(i.total), 0);
  const invoicedPaid = invoicedThisMonth
    .filter(i => i.paid_date)
    .reduce((s, i) => s + toNum(i.amount_received ?? i.total), 0);
  const invoicedOwed = invoicedThisMonth
    .filter(i => !i.paid_date)
    .reduce((s, i) => s + toNum(i.total), 0);

  const receivedTotal = paidThisMonth.reduce(
    (s, i) => s + toNum(i.amount_received ?? i.total),
    0,
  );

  const outstandingTotal = outstanding.reduce((s, i) => s + toNum(i.total), 0);

  const avgPayDays = (() => {
    const payDays = paidThisMonth
      .map(i => (typeof i.days_to_pay === 'number' ? i.days_to_pay : null))
      .filter((n): n is number => n !== null);
    if (payDays.length === 0) return null;
    return Math.round(payDays.reduce((s, n) => s + n, 0) / payDays.length);
  })();
  const winToInvoiceDays = (() => {
    const days: number[] = [];
    for (const i of invoicedThisMonth) {
      if (!i.tender_won_at || !i.issue_date) continue;
      if (i.tender_won_at > i.issue_date) continue;
      // Whole-day delta between two YYYY-MM-DD strings via UTC math.
      const [y1, m1, d1] = i.tender_won_at.split('-').map(Number);
      const [y2, m2, d2] = i.issue_date.split('-').map(Number);
      const a = Date.UTC(y1, m1 - 1, d1);
      const b = Date.UTC(y2, m2 - 1, d2);
      days.push(Math.round((b - a) / 86400000));
    }
    if (days.length === 0) return null;
    return Math.round(days.reduce((s, n) => s + n, 0) / days.length);
  })();

  // Turnover (last 12 months, rolling)
  const twelveMonthsAgo = addDaysYmd(todayLondon(), -365);
  const turnover12m = nonVoid
    .filter(i => i.issue_date >= twelveMonthsAgo && i.issue_date <= todayLondon())
    .reduce((s, i) => s + toNum(i.net_amount), 0);
  const belowThreshold = VAT_THRESHOLD - turnover12m;

  /* Tab counts */
  const awaitingSet = useMemo(
    () => nonVoid.filter(i => !i.paid_date),
    [nonVoid],
  );
  const paidSet = useMemo(
    () => nonVoid.filter(i => i.paid_date && (month === 'all' || monthKeyOf(i.paid_date) === month)),
    [nonVoid, month],
  );

  /* Awaiting sorted by due date */
  const awaitingSorted = useMemo(() => {
    return [...awaitingSet].sort((a, b) => {
      const da = a.due_date ?? '9999-12-31';
      const db = b.due_date ?? '9999-12-31';
      return da.localeCompare(db);
    });
  }, [awaitingSet]);

  const paidSorted = useMemo(() => {
    return [...paidSet].sort((a, b) => {
      const da = a.paid_date ?? '';
      const db = b.paid_date ?? '';
      return db.localeCompare(da);
    });
  }, [paidSet]);

  const voidSorted = useMemo(
    () => [...voided].sort((a, b) => (b.issue_date ?? '').localeCompare(a.issue_date ?? '')),
    [voided],
  );

  /* By-month rollup */
  interface MonthRow {
    key: string;
    label: string;
    invoiceCount: number;
    invoiced: number;
    received: number;
    avgPay: number | null;
  }
  const monthRows: MonthRow[] = useMemo(() => {
    const keys = new Set<string>();
    for (const inv of nonVoid) {
      const iss = monthKeyOf(inv.issue_date);
      if (iss) keys.add(iss);
    }
    if (keys.size === 0) return [];
    let min = currentMonth;
    keys.forEach(k => { if (k < min) min = k; });
    const range = monthKeyRange(min, currentMonth);

    return [...range].reverse().map(key => {
      const issued = nonVoid.filter(i => monthKeyOf(i.issue_date) === key);
      const paid = nonVoid.filter(i => monthKeyOf(i.paid_date) === key);
      const invoicedSum = issued.reduce((s, i) => s + toNum(i.total), 0);
      const receivedSum = paid.reduce((s, i) => s + toNum(i.amount_received ?? i.total), 0);
      const days = paid
        .map(i => (typeof i.days_to_pay === 'number' ? i.days_to_pay : null))
        .filter((n): n is number => n !== null);
      const avg = days.length > 0
        ? Math.round(days.reduce((s, n) => s + n, 0) / days.length)
        : null;
      return {
        key,
        label: shortMonthLabel(key),
        invoiceCount: issued.length,
        invoiced: invoicedSum,
        received: receivedSum,
        avgPay: avg,
      };
    });
  }, [nonVoid, currentMonth]);

  /* Search filter */
  const q = debouncedSearch.trim().toLowerCase();
  function matchesSearch(inv: Invoice): boolean {
    if (!q) return true;
    const hay = [
      inv.invoice_number ?? '',
      inv.client_name,
      inv.description,
      inv.contract_label ?? '',
      inv.tender_title ?? '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }
  function matchesSearchTender(t: ToInvoiceTender): boolean {
    if (!q) return true;
    const hay = [t.title, t.client_name ?? ''].join(' ').toLowerCase();
    return hay.includes(q);
  }

  const filteredToInvoice = toInvoice.filter(matchesSearchTender);
  const filteredAwaiting = awaitingSorted.filter(matchesSearch);
  const filteredPaid = paidSorted.filter(matchesSearch);
  const filteredVoid = voidSorted.filter(matchesSearch);

  /* Tabs */
  const tabs = [
    { key: 'to_invoice',  label: 'To Invoice',       count: toInvoice.length },
    { key: 'awaiting',    label: 'Awaiting Payment', count: awaitingSet.length },
    { key: 'paid',        label: 'Paid',             count: paidSet.length },
    { key: 'by_month',    label: 'By Month' },
    { key: 'void',        label: 'Void',             count: voided.length },
  ];

  /* Drawer tender options: every tender not dropped. */
  const tenderOptions: TenderPickerOption[] = useMemo(() => {
    return tenders
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
  }, [tenders]);

  /* ---------------- handlers ---------------- */

  function openAdd() {
    setDrawerSubmitError(null);
    setDrawerState({ mode: 'add' });
  }

  function openMarkSent(t: ToInvoiceTender) {
    setDrawerSubmitError(null);
    setDrawerState({
      mode: 'mark_sent',
      source: {
        id: t.id,
        title: t.title,
        procurement_type: t.procurement_type,
        evia_fee: t.evia_fee,
        client_id: t.client_id,
        client_name: t.client_name,
      },
    });
  }

  function openEdit(inv: Invoice) {
    setDrawerSubmitError(null);
    setDrawerState({ mode: 'edit', invoice: inv });
  }

  function closeDrawer() {
    setDrawerState(null);
    setDrawerSubmitError(null);
  }

  function payloadFromForm(values: InvoiceFormValues): Record<string, unknown> {
    return {
      invoice_number: values.invoice_number || null,
      category: values.category as InvoiceCategory,
      tender_id: values.tender_id ? parseInt(values.tender_id, 10) : null,
      client_id: values.client_id ? parseInt(values.client_id, 10) : null,
      client_name: values.client_name,
      description: values.description,
      contract_label: values.contract_label || null,
      net_amount: values.net_amount,
      vat_amount: values.vat_amount || '0',
      issue_date: values.issue_date || null,
      due_date: values.due_date || null,
      paid_date: values.paid_date || null,
      amount_received: values.amount_received || null,
      tide_transaction_id: values.tide_transaction_id || null,
      invoice_file: values.invoice_file || null,
      payment_evidence_file: values.payment_evidence_file || null,
      notes: values.notes || null,
    };
  }

  async function handleSaveInvoice(values: InvoiceFormValues) {
    if (!drawerState) return;
    setDrawerSubmitError(null);
    const payload = payloadFromForm(values);
    try {
      if (drawerState.mode === 'edit' && drawerState.invoice) {
        await api.put(`/invoices/${drawerState.invoice.id}`, payload);
        toast.success('Invoice updated');
      } else if (drawerState.mode === 'mark_sent') {
        const res = await api.post('/invoices', payload);
        const num = res.data?.invoice_number ?? '';
        toast.success(`${num || 'Invoice'} recorded`);
      } else {
        const res = await api.post('/invoices', payload);
        const num = res.data?.invoice_number ?? '';
        toast.success(`${num || 'Invoice'} recorded`);
      }
      closeDrawer();
      fetchData();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Something went wrong. Please try again.';
      setDrawerSubmitError(message);
    }
  }

  async function handleMarkPaid(payload: {
    paid_date: string;
    amount_received: string;
    tide_transaction_id: string;
    payment_evidence_file: string;
  }) {
    if (!markPaidTarget) return;
    const target = markPaidTarget;
    try {
      await api.put(`/invoices/${target.id}`, {
        paid_date: payload.paid_date || null,
        amount_received: payload.amount_received || null,
        tide_transaction_id: payload.tide_transaction_id || null,
        payment_evidence_file: payload.payment_evidence_file || null,
      });
      toast.success(`${target.invoice_number ?? 'Invoice'} marked paid`);
      setMarkPaidTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to mark paid. Please try again.');
    }
  }

  async function handleVoidConfirm(reason: string) {
    if (!voidTarget) return;
    const target = voidTarget;
    try {
      await api.post(`/invoices/${target.id}/void`, { reason });
      toast.success(`${target.invoice_number ?? 'Invoice'} voided`);
      setVoidTarget(null);
      // Also close the invoice drawer if it was open for this record.
      if (drawerState?.mode === 'edit' && drawerState.invoice?.id === target.id) {
        closeDrawer();
      }
      fetchData();
    } catch {
      toast.error('Failed to void invoice. Please try again.');
    }
  }

  async function handleRestore(inv: Invoice) {
    try {
      await api.post(`/invoices/${inv.id}/restore`);
      toast.success(`${inv.invoice_number ?? 'Invoice'} restored`);
      if (drawerState?.mode === 'edit' && drawerState.invoice?.id === inv.id) {
        closeDrawer();
      }
      fetchData();
    } catch {
      toast.error('Failed to restore invoice. Please try again.');
    }
  }

  async function handleDownloadCsv() {
    try {
      const res = await api.get('/invoices/export.csv', { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sales_Log_${todayLondon()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download the Sales Log. Please try again.');
    }
  }

  /* ---------------- Columns ---------------- */

  const toInvoiceCols: Column<ToInvoiceTender>[] = [
    {
      key: 'tender',
      header: 'Tender',
      width: 'flex',
      minWidth: 260,
      maxWidth: 360,
      render: r => <TenderCell row={r} />,
    },
    {
      key: 'fee',
      header: 'Fee',
      width: 120,
      align: 'right',
      mono: true,
      render: r => r.evia_fee != null
        ? formatMoney(r.evia_fee)
        : <span style={{ color: 'var(--text-tertiary)' }}>-</span>,
    },
    {
      key: 'won',
      header: 'Won',
      width: 130,
      align: 'right',
      mono: true,
      render: r => {
        const d = r.won_at || r.award_date;
        return d
          ? formatDate(d)
          : <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: 220,
      align: 'right',
      render: r => (
        <span className="dt-actions" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="primary" size="sm" icon={Send} onClick={() => openMarkSent(r)}>
            Mark Invoice Sent
          </Button>
        </span>
      ),
    },
  ];

  const awaitingCols: Column<Invoice>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      width: 'flex',
      minWidth: 260,
      maxWidth: 400,
      render: r => <InvoiceIdentityCell row={r} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 120,
      align: 'right',
      mono: true,
      render: r => formatMoney(r.total),
    },
    {
      key: 'issued',
      header: 'Issued',
      width: 110,
      align: 'right',
      mono: true,
      render: r => formatDate(r.issue_date),
    },
    {
      key: 'due',
      header: 'Due',
      width: 110,
      align: 'right',
      mono: true,
      render: r => r.due_date
        ? formatDate(r.due_date)
        : <span style={{ color: 'var(--text-tertiary)' }}>-</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 160,
      render: r => <AwaitingStatusBadge row={r} />,
    },
    {
      key: 'actions',
      header: '',
      width: 220,
      align: 'right',
      render: r => (
        <span className="dt-actions" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => setMarkPaidTarget(r)}>
            Mark Paid
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
            Edit
          </Button>
        </span>
      ),
    },
  ];

  const paidCols: Column<Invoice>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      width: 'flex',
      minWidth: 260,
      maxWidth: 400,
      render: r => <InvoiceIdentityCell row={r} />,
    },
    {
      key: 'received',
      header: 'Received',
      width: 120,
      align: 'right',
      mono: true,
      render: r => formatMoney(r.amount_received ?? r.total),
    },
    {
      key: 'issued',
      header: 'Issued',
      width: 110,
      align: 'right',
      mono: true,
      render: r => formatDate(r.issue_date),
    },
    {
      key: 'paid',
      header: 'Paid',
      width: 110,
      align: 'right',
      mono: true,
      render: r => r.paid_date ? formatDate(r.paid_date) : '-',
    },
    {
      key: 'days',
      header: 'Days to Pay',
      width: 120,
      align: 'right',
      mono: true,
      render: r => {
        if (typeof r.days_to_pay !== 'number') return '-';
        return r.days_to_pay === 0 ? 'Same Day' : daysWord(r.days_to_pay);
      },
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      align: 'right',
      render: r => (
        <span className="dt-actions" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
        </span>
      ),
    },
  ];

  const byMonthCols: Column<MonthRow>[] = [
    { key: 'month', header: 'Month', width: 110, render: r => r.label },
    { key: 'count', header: 'Invoices', width: 100, align: 'right', mono: true, render: r => r.invoiceCount },
    { key: 'invoiced', header: 'Invoiced', width: 130, align: 'right', mono: true, render: r => formatMoney(r.invoiced) },
    { key: 'received', header: 'Received', width: 130, align: 'right', mono: true, render: r => formatMoney(r.received) },
    {
      key: 'avg',
      header: 'Avg Days to Pay',
      width: 150,
      align: 'right',
      mono: true,
      render: r => r.avgPay == null ? '-' : daysWord(r.avgPay),
    },
  ];

  const voidCols: Column<Invoice>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      width: 'flex',
      minWidth: 260,
      maxWidth: 400,
      render: r => <InvoiceIdentityCell row={r} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 120,
      align: 'right',
      mono: true,
      render: r => formatMoney(r.total),
    },
    {
      key: 'issued',
      header: 'Issued',
      width: 110,
      align: 'right',
      mono: true,
      render: r => formatDate(r.issue_date),
    },
    {
      key: 'reason',
      header: 'Reason',
      width: 'flex',
      minWidth: 240,
      maxWidth: 320,
      render: r => r.void_reason
        ? <TruncatedText>{r.void_reason}</TruncatedText>
        : <span style={{ color: 'var(--text-tertiary)' }}>-</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      align: 'right',
      render: r => (
        <span className="dt-actions" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
        </span>
      ),
    },
  ];

  const emptyToInvoice = { message: 'Nothing waiting to be invoiced' };
  const emptyAwaiting = { message: 'No invoices awaiting payment' };
  const emptyPaid = {
    message: month === 'all'
      ? 'No payments received yet'
      : `No payments received in ${formatMonthLongYear(month)}`,
  };
  const emptyByMonth = { message: 'No months to show' };
  const emptyVoid = { message: 'No voided invoices' };

  const outstandingTone: KPITileTone = overdueCount > 0 ? 'danger' : 'warning';
  const turnoverTone: KPITileTone = turnover12m > VAT_THRESHOLD ? 'danger' : 'brand';
  const turnoverHint = turnover12m > VAT_THRESHOLD
    ? `${formatMoney(turnover12m - VAT_THRESHOLD)} over the VAT threshold`
    : `${formatMoney(VAT_THRESHOLD - turnover12m)} below the VAT threshold`;
  // avoid unused-var lint if belowThreshold is never referenced.
  void belowThreshold;

  const invoicedHint = invoicedThisMonth.length === 0
    ? 'Nothing invoiced'
    : `${formatMoney(invoicedPaid)} paid, ${formatMoney(invoicedOwed)} owed`;

  const receivedHint = paidThisMonth.length > 0
    ? pluralPayments(paidThisMonth.length)
    : undefined;

  const outstandingHintParts: string[] = [];
  if (outstanding.length > 0) {
    outstandingHintParts.push(`${outstanding.length} ${outstanding.length === 1 ? 'invoice' : 'invoices'}`);
    if (overdueCount > 0) outstandingHintParts.push(`${overdueCount} overdue`);
  }
  const outstandingHint = outstanding.length === 0
    ? 'Nothing outstanding'
    : outstandingHintParts.join(', ');

  const avgDaysHint = avgPayDays == null
    ? 'Sent to paid'
    : winToInvoiceDays == null
      ? 'Sent to paid'
      : `Win to invoice: ${winToInvoiceDays === 1 ? '1 day' : `${winToInvoiceDays} days`}`;

  return (
    <>
      <PageHeader
        title="Income"
        description="Track every invoice from win to payment"
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={handleDownloadCsv}>
              Download Sales Log
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add Income
            </Button>
          </>
        }
      />

      <div style={{ marginTop: 16, marginBottom: 16, maxWidth: 320 }}>
        <Select
          value={month}
          onValueChange={setMonth}
          options={monthOptions}
          ariaLabel="Month"
        />
      </div>

      <div className="kpi-row">
        <KPITile
          label="Invoiced"
          value={loading ? formatMoney(0) : formatMoney(invoicedTotal)}
          hint={invoicedHint}
          icon={Receipt}
          tone="info"
          mono
          loading={loading}
        />
        <KPITile
          label="Received"
          value={loading ? formatMoney(0) : formatMoney(receivedTotal)}
          hint={receivedHint}
          icon={CheckCircle2}
          tone="success"
          mono
          loading={loading}
        />
        <KPITile
          label="Outstanding"
          value={loading ? formatMoney(0) : formatMoney(outstandingTotal)}
          hint={outstandingHint}
          icon={overdueCount > 0 ? AlertCircle : Clock}
          tone={outstandingTone}
          mono
          loading={loading}
        />
        <KPITile
          label="Avg Days to Pay"
          value={
            loading
              ? '-'
              : avgPayDays == null
                ? '-'
                : (avgPayDays === 1 ? '1 day' : `${avgPayDays} days`)
          }
          hint={avgDaysHint}
          icon={Target}
          tone="warning"
          loading={loading}
        />
        <KPITile
          label="Turnover (12 Months)"
          value={loading ? formatMoney(0) : formatMoney(turnover12m)}
          hint={turnoverHint}
          icon={turnover12m > VAT_THRESHOLD ? TrendingUp : Wallet}
          tone={turnoverTone}
          mono
          loading={loading}
        />
      </div>

      <StageTabs tabs={tabs} activeKey={tab} onChange={k => setTab(k as TabKey)} />

      <FilterBar variant="attached">
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search invoices, clients, tenders..."
        />
      </FilterBar>

      {tab === 'to_invoice' && (
        <DataTable<ToInvoiceTender>
          columns={toInvoiceCols}
          data={filteredToInvoice}
          rowKey={r => String(r.id)}
          variant="attached"
          ariaLabel="Tenders to invoice"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load invoices"
          onRetry={fetchData}
          emptyState={emptyToInvoice}
        />
      )}
      {tab === 'awaiting' && (
        <DataTable<Invoice>
          columns={awaitingCols}
          data={filteredAwaiting}
          rowKey={r => String(r.id)}
          variant="attached"
          ariaLabel="Invoices awaiting payment"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load invoices"
          onRetry={fetchData}
          emptyState={emptyAwaiting}
        />
      )}
      {tab === 'paid' && (
        <DataTable<Invoice>
          columns={paidCols}
          data={filteredPaid}
          rowKey={r => String(r.id)}
          variant="attached"
          ariaLabel="Paid invoices"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load invoices"
          onRetry={fetchData}
          emptyState={emptyPaid}
        />
      )}
      {tab === 'by_month' && (
        <DataTable<MonthRow>
          columns={byMonthCols}
          data={monthRows}
          rowKey={r => r.key}
          variant="attached"
          ariaLabel="Income by month"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load invoices"
          onRetry={fetchData}
          onRowClick={row => { setMonth(row.key); setTab('paid'); }}
          emptyState={emptyByMonth}
        />
      )}
      {tab === 'void' && (
        <DataTable<Invoice>
          columns={voidCols}
          data={filteredVoid}
          rowKey={r => String(r.id)}
          variant="attached"
          ariaLabel="Voided invoices"
          isLoading={loading}
          isError={loadError}
          errorMessage="Couldn't load invoices"
          onRetry={fetchData}
          emptyState={emptyVoid}
        />
      )}

      <InvoiceDrawer
        open={drawerState !== null}
        mode={drawerState?.mode ?? 'add'}
        onClose={closeDrawer}
        onSave={handleSaveInvoice}
        onVoid={
          drawerState?.mode === 'edit' && drawerState.invoice && !drawerState.invoice.voided_at
            ? () => setVoidTarget(drawerState.invoice!)
            : undefined
        }
        onRestore={
          drawerState?.mode === 'edit' && drawerState.invoice && drawerState.invoice.voided_at
            ? () => handleRestore(drawerState.invoice!)
            : undefined
        }
        clients={clients.map(c => ({ id: c.id, name: c.company_name }))}
        tenderOptions={tenderOptions}
        sourceTender={drawerState?.source}
        invoice={drawerState?.invoice}
        nextNumber={nextNumber}
        submitError={drawerSubmitError}
      />

      <MarkPaidDialog
        open={markPaidTarget !== null}
        invoice={markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        onConfirm={handleMarkPaid}
      />

      <VoidInvoiceDialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoidConfirm}
      />
    </>
  );
}
