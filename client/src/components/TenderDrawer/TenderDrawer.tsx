import { useEffect, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Switch } from '../Switch/Switch';
import { Button } from '../Button/Button';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { ClientPicker, type ClientOption } from '../shared/ClientPicker';
import { tenderStatusOptions } from '../../lib/format';
import type { ProcurementType, TenderStatus } from '../../lib/types';

export type { TenderStatus };
// Re-export for callers that still import the legacy name from here.
export type TenderClientOption = ClientOption;

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
  procurement_type: ProcurementType;
  awaiting_info: boolean;
  awaiting_info_note: string;
  assigned_to: string;
  notes: string;
}

interface TenderDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Initial values - if absent, drawer renders in Add mode. */
  initial?: Partial<TenderFormValues> | null;
  clients?: ClientOption[];
  defaultAssignee?: string;
  /** Add-mode default for procurement_type. Ignored in Edit mode. */
  defaultProcurementType?: ProcurementType;
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
  status: 'questionnaire_sent',
  procurement_type: 'tender',
  awaiting_info: false,
  awaiting_info_note: '',
  assigned_to: '',
  notes: '',
};

const TYPE_OPTIONS: { value: ProcurementType; label: string }[] = [
  { value: 'tender',    label: 'Tender' },
  { value: 'framework', label: 'Framework' },
  { value: 'dps',       label: 'DPS' },
];

const ADD_TITLES: Record<ProcurementType, string> = {
  tender:    'Add tender',
  framework: 'Add framework',
  dps:       'Add DPS application',
};

const EDIT_TITLES: Record<ProcurementType, string> = {
  tender:    'Edit tender',
  framework: 'Edit framework',
  dps:       'Edit DPS application',
};

// Radix Select.Item forbids value="". Sentinel stands in for the
// "Unassigned" option in the dropdown; we translate back to '' before
// the value lands in form state, so the API payload is unchanged.
// (The client picker uses its own sentinel inside ClientPicker.)
const UNASSIGNED_SENTINEL = '__unassigned__';

const ASSIGNEE_OPTIONS = [
  { value: UNASSIGNED_SENTINEL, label: 'Unassigned' },
  { value: 'Vlad', label: 'Vlad' },
  { value: 'Tristan', label: 'Tristan' },
  { value: 'Both', label: 'Both' },
];

export function TenderDrawer({
  open,
  onClose,
  initial,
  clients = [],
  defaultAssignee = '',
  defaultProcurementType = 'tender',
  onSave,
}: TenderDrawerProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<TenderFormValues>(() => ({
    ...EMPTY,
    assigned_to: defaultAssignee,
    procurement_type: defaultProcurementType,
    ...(initial ?? {}),
  }));
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Reset whenever a new tender is loaded. In Add mode
   * procurement_type resets to defaultProcurementType alongside every
   * other field. In Edit mode `initial` carries the record's type. */
  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      assigned_to: defaultAssignee,
      procurement_type: defaultProcurementType,
      ...(initial ?? {}),
    });
    setTitleError(false);
  }, [open, initial, defaultAssignee, defaultProcurementType]);

  function update<K extends keyof TenderFormValues>(key: K, value: TenderFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleStatusChange(value: string) {
    setForm(prev => {
      const next = { ...prev, status: value as TenderStatus };
      // Clear awaiting_info if moving outside the active funnel.
      // The flag is meaningful while the row is in Info Gathering
      // or Writing; on Submitted / Won / Lost / Archived it is forced
      // off (server enforces the same rule on PUT).
      if (value !== 'questionnaire_sent' && value !== 'writing') {
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

  const awaitingDisabled =
    form.status !== 'questionnaire_sent' && form.status !== 'writing';

  const addTitle = ADD_TITLES[form.procurement_type];
  const editTitle = EDIT_TITLES[form.procurement_type];
  const drawerTitle = isEdit ? editTitle : addTitle;
  const submitLabel = isEdit ? 'Save changes' : addTitle;

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
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={drawerTitle}
      footer={footer}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <div className="field">
          <label className="field-label">Type</label>
          <SegmentedControl<ProcurementType>
            options={TYPE_OPTIONS}
            value={form.procurement_type}
            onChange={v => update('procurement_type', v)}
            ariaLabel="Type"
            fullWidth
          />
          {form.procurement_type === 'dps' && (
            <span className="field-hint">
              Includes dynamic markets. Not counted in the win rate.
            </span>
          )}
        </div>

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
                onChange={e => update('estimated_value', e.target.value)}
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
                placeholder="0"
                value={form.evia_fee}
                onChange={e => update('evia_fee', e.target.value)}
              />
            </div>
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

        <ClientPicker
          label="Client"
          clients={clients}
          value={form.client_id}
          onChange={v => update('client_id', v)}
        />

        <Select
          label="Status"
          value={form.status}
          onValueChange={handleStatusChange}
          options={
            // 'archived' is not a selectable stage. If the row is
            // already archived (four legacy rows exist from the old
            // auto-archive job), expose it once so the drawer can
            // display and reclassify it - after picking any other
            // value the option drops back out.
            form.status === 'archived'
              ? [
                  ...tenderStatusOptions(form.procurement_type),
                  { value: 'archived', label: 'Archived' },
                ]
              : tenderStatusOptions(form.procurement_type)
          }
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
            label="Chasing client for info"
            hint={
              awaitingDisabled
                ? 'Only available while status is Info Gathering or Writing'
                : 'Pauses progress visibly until you have what you need'
            }
          />
          {form.awaiting_info && !awaitingDisabled && (
            <Input
              placeholder="What are you chasing them for? (optional, shown in tooltip)"
              value={form.awaiting_info_note}
              onChange={e => update('awaiting_info_note', e.target.value)}
            />
          )}
        </div>

        <Select
          label="Assigned to"
          value={form.assigned_to || UNASSIGNED_SENTINEL}
          onValueChange={v => update('assigned_to', v === UNASSIGNED_SENTINEL ? '' : v)}
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
