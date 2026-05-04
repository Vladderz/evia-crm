import { useEffect, useRef, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Switch } from '../Switch/Switch';
import { Button } from '../Button/Button';

export type TenderStatus =
  | 'writing'
  | 'questionnaire_sent'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'archived';

export interface TenderFormValues {
  title: string;
  tender_url: string;
  buyer: string;
  estimated_value: string;
  evia_fee: string;
  submission_deadline: string;
  award_date: string;
  portal: string;
  reference_number: string;
  sector: string;
  client_id: string;
  status: TenderStatus;
  awaiting_info: boolean;
  awaiting_info_note: string;
  assigned_to: string;
  notes: string;
}

export interface TenderClientOption {
  id: number;
  name: string;
}

interface TenderDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Initial values - if absent, drawer renders in Add mode. */
  initial?: Partial<TenderFormValues> | null;
  clients?: TenderClientOption[];
  defaultAssignee?: string;
  onSave: (values: TenderFormValues) => Promise<void> | void;
}

const EMPTY: TenderFormValues = {
  title: '',
  tender_url: '',
  buyer: '',
  estimated_value: '',
  evia_fee: '',
  submission_deadline: '',
  award_date: '',
  portal: '',
  reference_number: '',
  sector: '',
  client_id: '',
  status: 'writing',
  awaiting_info: false,
  awaiting_info_note: '',
  assigned_to: '',
  notes: '',
};

const STATUS_OPTIONS = [
  { value: 'writing', label: 'Writing' },
  { value: 'questionnaire_sent', label: 'Questionnaire Sent' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'archived', label: 'Archived' },
];

const ASSIGNEE_OPTIONS = [
  { value: '', label: 'Unassigned' },
  { value: 'Vlad', label: 'Vlad' },
  { value: 'Tristan', label: 'Tristan' },
  { value: 'Both', label: 'Both' },
];

function calcAutoFee(valueStr: string): string {
  const v = parseFloat(valueStr);
  if (!valueStr || Number.isNaN(v) || v <= 0) return '';
  return String(Math.round(Math.max(v * 0.03, 2000)));
}

export function TenderDrawer({
  open,
  onClose,
  initial,
  clients = [],
  defaultAssignee = '',
  onSave,
}: TenderDrawerProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<TenderFormValues>(() => ({
    ...EMPTY,
    assigned_to: defaultAssignee,
    ...(initial ?? {}),
  }));
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);
  const feeManuallyEdited = useRef(!!initial?.evia_fee);

  /* Reset whenever a new tender is loaded. */
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, assigned_to: defaultAssignee, ...(initial ?? {}) });
    setTitleError(false);
    feeManuallyEdited.current = !!initial?.evia_fee;
  }, [open, initial, defaultAssignee]);

  function update<K extends keyof TenderFormValues>(key: K, value: TenderFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleValueChange(value: string) {
    setForm(prev => {
      const next = { ...prev, estimated_value: value };
      if (!feeManuallyEdited.current) next.evia_fee = calcAutoFee(value);
      return next;
    });
  }

  function handleFeeChange(value: string) {
    feeManuallyEdited.current = value !== '';
    update('evia_fee', value);
  }

  function handleStatusChange(value: string) {
    setForm(prev => {
      const next = { ...prev, status: value as TenderStatus };
      // Clear awaiting_info if moving away from writing
      if (value !== 'writing') {
        next.awaiting_info = false;
        next.awaiting_info_note = '';
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  const awaitingDisabled = form.status !== 'writing';

  const clientOptions = [
    { value: '', label: 'No client' },
    ...clients.map(c => ({ value: String(c.id), label: c.name })),
  ];

  const footer = (
    <>
      <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSubmit}
        loading={saving}
        type="submit"
      >
        {isEdit ? 'Save changes' : 'Add tender'}
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit tender' : 'Add tender'}
      footer={footer}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <Input
          label="Tender URL"
          placeholder="https://..."
          value={form.tender_url}
          onChange={e => update('tender_url', e.target.value)}
        />

        <Input
          label="Tender title"
          required
          value={form.title}
          error={titleError ? 'Tender title is required' : undefined}
          onChange={e => {
            update('title', e.target.value);
            if (titleError) setTitleError(false);
          }}
        />

        <Input
          label="Buyer / Contracting Authority"
          value={form.buyer}
          onChange={e => update('buyer', e.target.value)}
        />

        <div className="drawer-row">
          <div className="field">
            <label className="field-label">Estimated contract value</label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={form.estimated_value}
                onChange={e => handleValueChange(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Evia fee</label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="2000"
                value={form.evia_fee}
                onChange={e => handleFeeChange(e.target.value)}
              />
            </div>
            <span className="field-hint">
              Auto-calculated as 3% of value, min £2,000. Edit to override.
            </span>
          </div>
        </div>

        <div className="drawer-row">
          <Input
            label="Submission deadline"
            type="datetime-local"
            value={form.submission_deadline}
            onChange={e => update('submission_deadline', e.target.value)}
          />
          <Input
            label="Award date"
            type="date"
            value={form.award_date}
            onChange={e => update('award_date', e.target.value)}
          />
        </div>

        <div className="drawer-row">
          <Input
            label="Portal"
            placeholder="Contracts Finder, FTS, ProContract..."
            value={form.portal}
            onChange={e => update('portal', e.target.value)}
          />
          <Input
            label="Reference number"
            value={form.reference_number}
            onChange={e => update('reference_number', e.target.value)}
          />
        </div>

        <Input
          label="Sector"
          placeholder="e.g. Cleaning, Facilities Management"
          value={form.sector}
          onChange={e => update('sector', e.target.value)}
        />

        <Select
          label="Client"
          value={form.client_id}
          onValueChange={v => update('client_id', v)}
          options={clientOptions}
          placeholder="Choose a client"
        />

        <Select
          label="Status"
          value={form.status}
          onValueChange={handleStatusChange}
          options={STATUS_OPTIONS}
        />

        <div
          className="field"
          style={{
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            gap: 10,
            opacity: awaitingDisabled ? 0.6 : 1,
          }}
        >
          <Switch
            checked={form.awaiting_info}
            onChange={v => update('awaiting_info', v)}
            disabled={awaitingDisabled}
            label="Awaiting info from client"
            hint={
              awaitingDisabled
                ? 'Only available when status is Writing'
                : 'Pauses progress visibly until you have what you need'
            }
          />
          {form.awaiting_info && !awaitingDisabled && (
            <Input
              placeholder="What are you waiting for? (optional, shown in tooltip)"
              value={form.awaiting_info_note}
              onChange={e => update('awaiting_info_note', e.target.value)}
            />
          )}
        </div>

        <Select
          label="Assigned to"
          value={form.assigned_to}
          onValueChange={v => update('assigned_to', v)}
          options={ASSIGNEE_OPTIONS}
          placeholder="Unassigned"
        />

        <Textarea
          label="Notes"
          rows={3}
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
        />
      </form>
    </Drawer>
  );
}
