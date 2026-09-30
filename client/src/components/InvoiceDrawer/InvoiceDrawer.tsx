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
  formatDate,
  formatMoney,
  todayLondon,
} from '../../lib/format';
import type { Invoice, InvoiceCategory, ProcurementType } from '../../lib/types';
import {
  buildInvoiceGroups,
  openInvoicesForClient,
  type InvoiceGroup,
} from '../../lib/invoiceGroups';

export type InvoiceDrawerMode = 'add' | 'mark_sent' | 'edit';

export interface InvoiceFormValues {
  invoice_number: string;
  category: InvoiceCategory;
  tender_id: string;
  client_id: string;
  client_name: string;
  description: string;
  net_amount: string;
  vat_amount: string;
  issue_date: string;
  due_date: string;
  paid_date: string;
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
  /**
   * The page's full invoice list. Powers the "Add to an existing
   * invoice" flow in Mark sent and Add modes, the typed-number check
   * in every mode, and the "Part of INV-007" note in Edit mode.
   * Optional so pages that don't have the list handy still work.
   */
  invoices?: Invoice[];
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
    net_amount: '',
    vat_amount: '0.00',
    issue_date: todayLondon(),
    due_date: addDaysYmd(todayLondon(), 14),
    paid_date: '',
    notes: '',
  };
}

function invoiceToForm(inv: Invoice): InvoiceFormValues {
  const netStr = inv.net_amount == null ? '' : String(parseFloat(String(inv.net_amount)).toFixed(2));
  const vatStr = inv.vat_amount == null ? '0.00' : String(parseFloat(String(inv.vat_amount)).toFixed(2));
  return {
    invoice_number: inv.invoice_number ?? '',
    category: inv.category,
    tender_id: inv.tender_id != null ? String(inv.tender_id) : '',
    client_id: inv.client_id != null ? String(inv.client_id) : '',
    client_name: inv.client_name ?? '',
    description: inv.description ?? '',
    net_amount: netStr,
    vat_amount: vatStr,
    issue_date: inv.issue_date ?? '',
    due_date: inv.due_date ?? '',
    paid_date: inv.paid_date ?? '',
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
    net_amount: fee,
    vat_amount: '0.00',
    issue_date: today,
    due_date: addDaysYmd(today, 14),
    paid_date: '',
    notes: '',
  };
}

function addPrefill(nextNumber: string | undefined): InvoiceFormValues {
  return {
    ...emptyForm(),
    invoice_number: nextNumber ?? '',
  };
}

const EXISTING_INVOICE_MODE = 'existing';
const NEW_INVOICE_MODE = 'new';
type AddExistingMode = typeof NEW_INVOICE_MODE | typeof EXISTING_INVOICE_MODE;

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
  invoices = [],
}: InvoiceDrawerProps) {
  const [form, setForm] = useState<InvoiceFormValues>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  // "Add to an existing invoice" flow only applies in Add / Mark sent.
  // The picked invoice's shared fields become read-only; the item's
  // own fields (amount, description, notes) stay editable.
  const [addExistingMode, setAddExistingMode] = useState<AddExistingMode>(NEW_INVOICE_MODE);
  const [existingInvoiceKey, setExistingInvoiceKey] = useState<string>('');
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
    setAddExistingMode(NEW_INVOICE_MODE);
    setExistingInvoiceKey('');
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
      // Fill the client only when it is empty, so a hand-picked client
      // is never overwritten.
      if (!next.client_id && t.client_id != null) next.client_id = String(t.client_id);
      // In Add and Mark sent modes, also fill the amount from the fee
      // and the description from a standard template when empty.
      if (mode === 'add' || mode === 'mark_sent') {
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

  const isEditMode = mode === 'edit';

  // Same-client open invoices for the "Add to an existing invoice"
  // flow. Uses the current form's picked client, so switching client
  // rebuilds the list. In Edit mode the drawer never offers the flow.
  const openInvoices: InvoiceGroup[] = (() => {
    if (isEditMode) return [];
    const cid = form.client_id ? parseInt(form.client_id, 10) : null;
    const cname = form.client_name || '';
    if (cid == null && !cname.trim()) return [];
    return openInvoicesForClient(invoices, cid, cname);
  })();

  // Groups + item lookup for the typed-number check and the multi-item
  // note in Edit mode.
  const groups = buildInvoiceGroups(invoices);
  const trimmedNumber = form.invoice_number.trim();
  const excludeSelfId = isEditMode ? invoice?.id ?? null : null;
  function isSameClientOf(g: InvoiceGroup): boolean {
    const cid = form.client_id ? parseInt(form.client_id, 10) : null;
    const cname = (form.client_name || '').trim().toLowerCase();
    const first = g.items[0]!;
    if (cid != null && first.client_id != null) return cid === first.client_id;
    const gname = (first.client_name || '').trim().toLowerCase();
    if (!gname || !cname) return false;
    return gname === cname;
  }
  const numberCheck: {
    kind: 'unused' | 'sameClient' | 'cross' | 'voidOnly';
    group?: InvoiceGroup;
    otherClientName?: string;
  } = (() => {
    if (!trimmedNumber) return { kind: 'unused' };
    const withNumber = groups.filter(g => (g.number ?? '').trim() === trimmedNumber);
    // Filter out the row currently being edited from its own group so
    // typing the same number in Edit mode does not flag itself.
    const filtered = withNumber
      .map(g => ({
        ...g,
        items: excludeSelfId ? g.items.filter(i => i.id !== excludeSelfId) : g.items,
      }))
      .filter(g => g.items.length > 0);
    const live = filtered.filter(g => g.state !== 'void');
    if (live.length === 0) {
      if (filtered.length > 0) return { kind: 'voidOnly' };
      return { kind: 'unused' };
    }
    const other = live.find(g => !isSameClientOf(g));
    if (other) return { kind: 'cross', otherClientName: other.clientName };
    return { kind: 'sameClient', group: live[0] };
  })();

  // In Edit mode, the multi-item note tells the user which fields are
  // shared. The group here uses the raw invoice (not filtered) because
  // the note counts every sibling, including the item being edited.
  const editGroup: InvoiceGroup | null = (() => {
    if (!isEditMode || !invoice) return null;
    return groups.find(g => g.items.some(i => i.id === invoice.id)) ?? null;
  })();

  const existingInvoiceOptions: { value: string; label: string }[] = openInvoices.map(g => {
    const itemsBit = g.itemCount === 1 ? '1 item' : `${g.itemCount} items`;
    const dateBit = g.issueDate ? formatDate(g.issueDate) : 'no date';
    return {
      value: g.key,
      label: `${g.number ?? 'No number'}, ${dateBit}, ${formatMoney(g.total)}, ${itemsBit}`,
    };
  });

  const existingLocked = addExistingMode === EXISTING_INVOICE_MODE && !!existingInvoiceKey;

  function chooseExistingInvoice(key: string) {
    setExistingInvoiceKey(key);
    const g = openInvoices.find(x => x.key === key);
    if (!g) return;
    const first = g.items[0]!;
    // Category defaults to the invoice's category when every item on
    // it shares one; otherwise leave the current pick.
    const categories = Array.from(new Set(g.items.map(i => i.category)));
    setForm(prev => ({
      ...prev,
      invoice_number: g.number ?? '',
      issue_date: g.issueDate ?? prev.issue_date,
      due_date: g.dueDate ?? prev.due_date,
      client_id: first.client_id != null ? String(first.client_id) : '',
      client_name: first.client_name ?? prev.client_name,
      category: categories.length === 1 ? categories[0]! : prev.category,
    }));
    dueDateManuallyEdited.current = true;
    setErrors(prev => ({ ...prev, invoice_number: undefined }));
  }

  function handleAddExistingModeChange(next: AddExistingMode) {
    setAddExistingMode(next);
    if (next === NEW_INVOICE_MODE) {
      setExistingInvoiceKey('');
      setForm(prev => ({
        ...prev,
        invoice_number: nextNumber ?? prev.invoice_number,
        issue_date: todayLondon(),
        due_date: addDaysYmd(todayLondon(), 14),
      }));
      dueDateManuallyEdited.current = false;
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof InvoiceFormValues, string>> = {};
    if (!form.client_id && !form.client_name.trim()) {
      next.client_name = 'Client name is required';
    }
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
  const showAddExistingToggle =
    !isEdit && openInvoices.length > 0;
  const numberBlocked = numberCheck.kind === 'cross' || numberCheck.kind === 'voidOnly';
  const saveDisabled = saving || numberBlocked;

  const drawerTitle =
    isEdit ? 'Edit income' :
    isMarkSent ? 'Mark invoice sent' :
    'Add income';
  const drawerDescription = isEdit && invoice
    ? `${invoice.invoice_number ?? 'No number'} · ${invoice.client_name}`
    : undefined;
  const submitLabel =
    isEdit ? 'Save changes' :
    isMarkSent ? 'Mark invoice sent' :
    'Add income';

  const netFloat = parseFloat(form.net_amount);
  const vatFloat = parseFloat(form.vat_amount || '0');
  const total = (Number.isFinite(netFloat) ? netFloat : 0) + (Number.isFinite(vatFloat) ? vatFloat : 0);

  const tenderSelectOptions = (() => {
    const opts: { value: string; label: string }[] = [{ value: NO_TENDER_SENTINEL, label: 'No tender' }];
    // In Edit mode the invoice may point at a tender the caller did not
    // include (archived, dropped, or otherwise off the current page's
    // list). Synthesise an option for it so saving an edit can never
    // silently unlink the invoice from its tender.
    const merged: TenderPickerOption[] = tenderOptions.slice();
    if (isEdit && invoice?.tender_id != null && !merged.some(t => t.id === invoice.tender_id)) {
      merged.push({
        id: invoice.tender_id,
        title: invoice.tender_title ?? `Tender #${invoice.tender_id}`,
        status: invoice.tender_status ?? 'archived',
        client_id: invoice.client_id ?? null,
        client_name: invoice.client_name ?? null,
        procurement_type: (invoice.tender_type ?? 'tender') as ProcurementType,
        evia_fee: null,
      });
    }
    const won: TenderPickerOption[] = [];
    const other: TenderPickerOption[] = [];
    for (const t of merged) {
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

  const invoiceNumberHint = !isEdit && nextNumber
    ? `Next in sequence: ${nextNumber}`
    : undefined;

  const showClientName = !form.client_id;

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
        disabled={saveDisabled}
        type="submit"
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} description={drawerDescription} footer={footer}>
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        {isEdit && editGroup && editGroup.itemCount > 1 && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
            }}
          >
            {`Part of ${editGroup.number ?? 'this invoice'}: ${editGroup.itemCount} items, ${formatMoney(editGroup.total)}. Number, client, dates and payment details apply to the whole invoice.`}
          </div>
        )}

        {showAddExistingToggle && (
          <div className="field">
            <label className="field-label">Invoice</label>
            <SegmentedControl<AddExistingMode>
              options={[
                { value: NEW_INVOICE_MODE, label: 'New invoice' },
                { value: EXISTING_INVOICE_MODE, label: 'Add to existing invoice' },
              ]}
              value={addExistingMode}
              onChange={handleAddExistingModeChange}
              ariaLabel="Invoice mode"
              fullWidth
            />
            {addExistingMode === EXISTING_INVOICE_MODE && (
              <div style={{ marginTop: 8 }}>
                <Select
                  label="Existing invoice"
                  value={existingInvoiceKey}
                  onValueChange={chooseExistingInvoice}
                  options={existingInvoiceOptions}
                  placeholder="Pick an open invoice"
                />
              </div>
            )}
          </div>
        )}

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
          label="Tender"
          value={form.tender_id || NO_TENDER_SENTINEL}
          onValueChange={handleTenderChange}
          options={tenderSelectOptions}
          hint="Optional. Leave as No tender for odd jobs."
        />

        <ClientPicker
          label="Client"
          clients={clients}
          value={form.client_id}
          onChange={v => update('client_id', v)}
        />

        {showClientName && (
          <Input
            label="Client name"
            required
            value={form.client_name}
            hint={errors.client_name ? undefined : "Not in Client Book? Type the client's name."}
            error={errors.client_name}
            onChange={e => update('client_name', e.target.value)}
          />
        )}

        <Textarea
          label="Description"
          rows={2}
          required
          value={form.description}
          error={errors.description}
          onChange={e => update('description', e.target.value)}
        />

        <Input
          label="Invoice number"
          value={form.invoice_number}
          readOnly={existingLocked}
          hint={
            numberCheck.kind === 'sameClient' && numberCheck.group
              ? `This adds the item to ${trimmedNumber} (${numberCheck.group.itemCount} items, ${formatMoney(numberCheck.group.total)})`
              : existingLocked
                ? `Set by ${trimmedNumber || 'the invoice you picked'}`
                : invoiceNumberHint
          }
          error={
            numberCheck.kind === 'cross'
              ? `${trimmedNumber} is already used for ${numberCheck.otherClientName ?? 'another client'}.`
              : numberCheck.kind === 'voidOnly'
                ? `${trimmedNumber} was voided. Numbers are never reused.`
                : undefined
          }
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
            readOnly={existingLocked}
            hint={existingLocked ? `Set by ${trimmedNumber || 'the invoice you picked'}` : undefined}
            error={errors.issue_date}
            onChange={e => handleIssueDateChange(e.target.value)}
          />
          <Input
            label="Due date"
            type="date"
            value={form.due_date}
            readOnly={existingLocked}
            hint={existingLocked ? `Set by ${trimmedNumber || 'the invoice you picked'}` : undefined}
            onChange={e => handleDueDateChange(e.target.value)}
          />
        </div>

        <Input
          label="Date paid"
          type="date"
          value={form.paid_date}
          hint={errors.paid_date ? undefined : 'Leave blank until the money lands'}
          error={errors.paid_date}
          onChange={e => update('paid_date', e.target.value)}
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
