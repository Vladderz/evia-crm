import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Button } from '../Button/Button';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { ClientPicker, type ClientOption } from '../shared/ClientPicker';
import {
  INVOICE_CATEGORY_LABELS,
  addDaysYmd,
  formatMoney,
  todayLondon,
} from '../../lib/format';
import type { Invoice, InvoiceCategory, ProcurementType } from '../../lib/types';

export type InvoiceDrawerMode = 'add' | 'mark_sent' | 'edit';

export interface InvoiceFormValues {
  invoice_number: string;
  category: InvoiceCategory;
  tender_id: string;
  client_id: string;
  client_name: string;
  description: string;
  contract_label: string;
  net_amount: string;
  vat_amount: string;
  issue_date: string;
  due_date: string;
  paid_date: string;
  amount_received: string;
  tide_transaction_id: string;
  invoice_file: string;
  payment_evidence_file: string;
  notes: string;
}

export interface TenderPickerOption {
  id: number;
  title: string;
  status: string;
  client_id: number | null;
  client_name: string | null;
  procurement_type: ProcurementType;
  evia_fee: number | string | null;
}

export interface MarkSentSource {
  id: number;
  title: string;
  procurement_type: ProcurementType;
  evia_fee: number | string | null;
  client_id: number | null;
  client_name: string | null;
}

interface InvoiceDrawerProps {
  open: boolean;
  mode: InvoiceDrawerMode;
  onClose: () => void;
  onSave: (values: InvoiceFormValues) => Promise<void> | void;
  onVoid?: () => void;
  onRestore?: () => void;
  clients?: ClientOption[];
  tenderOptions?: TenderPickerOption[];
  /** For 'mark_sent' mode: the tender we are invoicing for. */
  sourceTender?: MarkSentSource;
  /** For 'edit' mode: the invoice being edited. */
  invoice?: Invoice;
  /** Fetched from GET /api/invoices/next-number. */
  nextNumber?: string;
  /** Server error message to show at the bottom of the form. */
  submitError?: string | null;
}

const CATEGORY_OPTIONS: { value: InvoiceCategory; label: string }[] = [
  { value: 'success_fee', label: INVOICE_CATEGORY_LABELS.success_fee! },
  { value: 'fixed_fee',   label: INVOICE_CATEGORY_LABELS.fixed_fee! },
  { value: 'retainer',    label: INVOICE_CATEGORY_LABELS.retainer! },
  { value: 'other',       label: INVOICE_CATEGORY_LABELS.other! },
];

const NO_TENDER_SENTINEL = '__no_tender__';

function emptyForm(): InvoiceFormValues {
  return {
    invoice_number: '',
    category: 'fixed_fee',
    tender_id: '',
    client_id: '',
    client_name: '',
    description: '',
    contract_label: '',
    net_amount: '',
    vat_amount: '0.00',
    issue_date: todayLondon(),
    due_date: addDaysYmd(todayLondon(), 14),
    paid_date: '',
    amount_received: '',
    tide_transaction_id: '',
    invoice_file: '',
    payment_evidence_file: '',
    notes: '',
  };
}

function invoiceToForm(inv: Invoice): InvoiceFormValues {
  const netStr = inv.net_amount == null ? '' : String(parseFloat(String(inv.net_amount)).toFixed(2));
  const vatStr = inv.vat_amount == null ? '0.00' : String(parseFloat(String(inv.vat_amount)).toFixed(2));
  const arStr = inv.amount_received == null ? '' : String(parseFloat(String(inv.amount_received)).toFixed(2));
  return {
    invoice_number: inv.invoice_number ?? '',
    category: inv.category,
    tender_id: inv.tender_id != null ? String(inv.tender_id) : '',
    client_id: inv.client_id != null ? String(inv.client_id) : '',
    client_name: inv.client_name ?? '',
    description: inv.description ?? '',
    contract_label: inv.contract_label ?? '',
    net_amount: netStr,
    vat_amount: vatStr,
    issue_date: inv.issue_date ?? '',
    due_date: inv.due_date ?? '',
    paid_date: inv.paid_date ?? '',
    amount_received: arStr,
    tide_transaction_id: inv.tide_transaction_id ?? '',
    invoice_file: inv.invoice_file ?? '',
    payment_evidence_file: inv.payment_evidence_file ?? '',
    notes: inv.notes ?? '',
  };
}

function markSentPrefill(src: MarkSentSource, nextNumber: string | undefined): InvoiceFormValues {
  const today = todayLondon();
  const fee = src.evia_fee == null ? '' : String(parseFloat(String(src.evia_fee)).toFixed(2));
  return {
    invoice_number: nextNumber ?? '',
    category: 'success_fee',
    tender_id: String(src.id),
    client_id: src.client_id != null ? String(src.client_id) : '',
    client_name: src.client_name ?? '',
    description: `Bid writing success fee: ${src.title}`,
    contract_label: src.title,
    net_amount: fee,
    vat_amount: '0.00',
    issue_date: today,
    due_date: addDaysYmd(today, 14),
    paid_date: '',
    amount_received: '',
    tide_transaction_id: '',
    invoice_file: '',
    payment_evidence_file: '',
    notes: '',
  };
}

function addPrefill(nextNumber: string | undefined): InvoiceFormValues {
  return {
    ...emptyForm(),
    invoice_number: nextNumber ?? '',
  };
}

export function InvoiceDrawer({
  open,
  mode,
  onClose,
  onSave,
  onVoid,
  onRestore,
  clients = [],
  tenderOptions = [],
  sourceTender,
  invoice,
  nextNumber,
  submitError,
}: InvoiceDrawerProps) {
  const [form, setForm] = useState<InvoiceFormValues>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  // Track whether the user has hand-edited the due date. Until they do,
  // it follows the issue date + 14 days.
  const dueDateManuallyEdited = useRef(false);

  const resetForm = useCallback(() => {
    if (mode === 'edit' && invoice) {
      setForm(invoiceToForm(invoice));
      dueDateManuallyEdited.current = true; // stored value is truth
    } else if (mode === 'mark_sent' && sourceTender) {
      setForm(markSentPrefill(sourceTender, nextNumber));
      dueDateManuallyEdited.current = false;
    } else {
      setForm(addPrefill(nextNumber));
      dueDateManuallyEdited.current = false;
    }
    setErrors({});
    setSaving(false);
  }, [mode, invoice, sourceTender, nextNumber]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  function update<K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function handleIssueDateChange(value: string) {
    setForm(prev => {
      const next = { ...prev, issue_date: value };
      if (!dueDateManuallyEdited.current && value) {
        next.due_date = addDaysYmd(value, 14);
      }
      return next;
    });
    setErrors(prev => (prev.issue_date ? { ...prev, issue_date: undefined } : prev));
  }

  function handleDueDateChange(value: string) {
    dueDateManuallyEdited.current = true;
    update('due_date', value);
  }

  function handleCategoryChange(value: InvoiceCategory) {
    update('category', value);
  }

  function handleTenderChange(value: string) {
    const picked = value === NO_TENDER_SENTINEL ? '' : value;
    setForm(prev => {
      const next = { ...prev, tender_id: picked };
      if (!picked) return next;
      const t = tenderOptions.find(o => String(o.id) === picked);
      if (!t) return next;
      // Fill client + client name + contract label only when they are
      // empty, so a hand-typed value is never overwritten.
      if (!next.client_id && t.client_id != null) next.client_id = String(t.client_id);
      if (!next.client_name && t.client_name) next.client_name = t.client_name;
      if (!next.contract_label && t.title) next.contract_label = t.title;
      // In Add mode only, also fill the amount from the fee and the
      // description from a standard template.
      if (mode === 'add') {
        if (!next.net_amount && t.evia_fee != null) {
          next.net_amount = String(parseFloat(String(t.evia_fee)).toFixed(2));
        }
        if (!next.description) {
          next.description = `Bid writing success fee: ${t.title}`;
        }
      }
      return next;
    });
  }

  function validate(): boolean {
    const next: Partial<Record<keyof InvoiceFormValues, string>> = {};
    if (!form.client_name.trim()) next.client_name = 'Client name is required';
    if (!form.description.trim()) next.description = 'Description is required';
    const net = parseFloat(form.net_amount);
    if (!Number.isFinite(net) || net < 0) next.net_amount = 'Amounts must be zero or more';
    const vat = parseFloat(form.vat_amount || '0');
    if (!Number.isFinite(vat) || vat < 0) next.vat_amount = 'Amounts must be zero or more';
    if (!form.issue_date) next.issue_date = 'Enter a valid date';
    if (form.paid_date && form.issue_date && form.paid_date < form.issue_date) {
      next.paid_date = `Date paid can't be before the issue date`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === 'edit';
  const isMarkSent = mode === 'mark_sent';
  const isVoided = !!invoice?.voided_at;

  const drawerTitle =
    isEdit ? 'Edit income' :
    isMarkSent ? 'Mark invoice sent' :
    'Add income';
  const submitLabel =
    isEdit ? 'Save changes' :
    isMarkSent ? 'Mark invoice sent' :
    'Add income';

  const netFloat = parseFloat(form.net_amount);
  const vatFloat = parseFloat(form.vat_amount || '0');
  const total = (Number.isFinite(netFloat) ? netFloat : 0) + (Number.isFinite(vatFloat) ? vatFloat : 0);

  const tenderSelectOptions = (() => {
    const opts: { value: string; label: string }[] = [{ value: NO_TENDER_SENTINEL, label: 'No tender' }];
    const won: TenderPickerOption[] = [];
    const other: TenderPickerOption[] = [];
    for (const t of tenderOptions) {
      (t.status === 'won' ? won : other).push(t);
    }
    won.sort((a, b) => a.title.localeCompare(b.title));
    other.sort((a, b) => a.title.localeCompare(b.title));
    for (const t of [...won, ...other]) {
      const clientBit = t.client_name ? ` (${t.client_name})` : '';
      opts.push({ value: String(t.id), label: `${t.title}${clientBit}` });
    }
    return opts;
  })();

  const invoiceNumberHint = nextNumber
    ? `Next in sequence: ${nextNumber}`
    : undefined;

  const footer = (
    <>
      <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      {isEdit && !isVoided && onVoid && (
        <Button variant="danger" size="md" onClick={onVoid} disabled={saving}>
          Void invoice
        </Button>
      )}
      {isEdit && isVoided && onRestore && (
        <Button variant="secondary" size="md" onClick={onRestore} disabled={saving}>
          Restore
        </Button>
      )}
      <Button
        variant="primary"
        size="md"
        onClick={() => handleSubmit()}
        loading={saving}
        type="submit"
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} footer={footer}>
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <div className="field">
          <label className="field-label">Category</label>
          <SegmentedControl<InvoiceCategory>
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={handleCategoryChange}
            ariaLabel="Category"
            fullWidth
          />
        </div>

        <Select
          label="Linked tender"
          value={form.tender_id || NO_TENDER_SENTINEL}
          onValueChange={handleTenderChange}
          options={tenderSelectOptions}
        />

        <ClientPicker
          label="Client"
          clients={clients}
          value={form.client_id}
          onChange={v => update('client_id', v)}
        />

        <Input
          label="Client name on invoice"
          required
          value={form.client_name}
          hint={errors.client_name ? undefined : 'Exactly as it appears on the invoice'}
          error={errors.client_name}
          onChange={e => update('client_name', e.target.value)}
        />

        <Textarea
          label="Description"
          rows={2}
          required
          value={form.description}
          hint={errors.description ? undefined : "Name the tender or contract. 'Success fee' on its own isn't enough for HMRC."}
          error={errors.description}
          onChange={e => update('description', e.target.value)}
        />

        <Input
          label="Tender or contract"
          value={form.contract_label}
          hint="Shown in the Sales Log download"
          onChange={e => update('contract_label', e.target.value)}
        />

        <Input
          label="Invoice number"
          value={form.invoice_number}
          hint={invoiceNumberHint}
          onChange={e => update('invoice_number', e.target.value)}
        />

        <div className="drawer-row">
          <div className="field">
            <label className="field-label">Net amount</label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={form.net_amount}
                onChange={e => update('net_amount', e.target.value)}
              />
            </div>
            {errors.net_amount && (
              <span className="field-error">{errors.net_amount}</span>
            )}
          </div>
          <div className="field">
            <label className="field-label">VAT</label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={form.vat_amount}
                onChange={e => update('vat_amount', e.target.value)}
              />
            </div>
            {errors.vat_amount
              ? <span className="field-error">{errors.vat_amount}</span>
              : <span className="field-hint">Not VAT registered</span>}
          </div>
        </div>

        <div className="field">
          <span className="field-hint" style={{ marginTop: -4 }}>
            Total {formatMoney(total)}
          </span>
        </div>

        <div className="drawer-row">
          <Input
            label="Issue date"
            type="date"
            required
            value={form.issue_date}
            error={errors.issue_date}
            onChange={e => handleIssueDateChange(e.target.value)}
          />
          <Input
            label="Due date"
            type="date"
            value={form.due_date}
            onChange={e => handleDueDateChange(e.target.value)}
          />
        </div>

        <div
          className="field"
          style={{
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            gap: 12,
          }}
        >
          <span className="field-label">Payment</span>
          <div className="drawer-row">
            <Input
              label="Date paid"
              type="date"
              value={form.paid_date}
              error={errors.paid_date}
              onChange={e => update('paid_date', e.target.value)}
            />
            <div className="field">
              <label className="field-label">Amount received</label>
              <div className="drawer-currency">
                <span className="drawer-currency-prefix">£</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={total > 0 ? total.toFixed(2) : '0.00'}
                  value={form.amount_received}
                  onChange={e => update('amount_received', e.target.value)}
                />
              </div>
            </div>
          </div>
          <Input
            label="Tide transaction ID"
            value={form.tide_transaction_id}
            onChange={e => update('tide_transaction_id', e.target.value)}
          />
          <Input
            label="Payment evidence file"
            value={form.payment_evidence_file}
            hint="INV-005 [date received] Client Payment.png"
            onChange={e => update('payment_evidence_file', e.target.value)}
          />
        </div>

        <Input
          label="Invoice file"
          value={form.invoice_file}
          hint="INV-005 28-09-2026 Client.pdf"
          onChange={e => update('invoice_file', e.target.value)}
        />

        <Textarea
          label="Notes"
          rows={3}
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
        />

        {submitError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'var(--badge-danger-bg)',
              color: 'var(--badge-danger-text)',
              border: '1px solid var(--badge-danger-dot)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            }}
          >
            {submitError}
          </div>
        )}
      </form>
    </Drawer>
  );
}
