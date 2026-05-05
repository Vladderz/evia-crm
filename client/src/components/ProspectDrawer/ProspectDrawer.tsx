import { useEffect, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Button } from '../Button/Button';

export type ProspectStatus = 'contacted' | 'call_booked';

export interface ProspectFormValues {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  sector: string;
  region: string;
  tender_title: string;
  tender_url: string;
  tender_reference: string;
  tender_value: string;
  submission_deadline: string;
  award_date: string;
  buyer: string;
  status: ProspectStatus;
  last_contact_date: string;
  next_followup_date: string;
  assigned_to: string;
  notes: string;
}

interface ProspectDrawerProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ProspectFormValues> | null;
  defaultAssignee?: string;
  onSave: (values: ProspectFormValues) => Promise<void> | void;
}

const EMPTY: ProspectFormValues = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  sector: '',
  region: '',
  tender_title: '',
  tender_url: '',
  tender_reference: '',
  tender_value: '',
  submission_deadline: '',
  award_date: '',
  buyer: '',
  status: 'contacted',
  last_contact_date: '',
  next_followup_date: '',
  assigned_to: '',
  notes: '',
};

const STATUS_OPTIONS = [
  { value: 'contacted', label: 'Contacted' },
  { value: 'call_booked', label: 'Call Booked' },
];

// Radix Select.Item forbids value="". Sentinel stands in for the
// "Unassigned" option in the dropdown; we translate back to '' before
// the value lands in form state, so the API payload is unchanged.
const UNASSIGNED_SENTINEL = '__unassigned__';

const ASSIGNEE_OPTIONS = [
  { value: UNASSIGNED_SENTINEL, label: 'Unassigned' },
  { value: 'Vlad', label: 'Vlad' },
  { value: 'Tristan', label: 'Tristan' },
  { value: 'Both', label: 'Both' },
];

export function ProspectDrawer({
  open,
  onClose,
  initial,
  defaultAssignee = '',
  onSave,
}: ProspectDrawerProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ProspectFormValues>(() => ({
    ...EMPTY,
    assigned_to: defaultAssignee,
    ...(initial ?? {}),
  }));
  const [companyError, setCompanyError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, assigned_to: defaultAssignee, ...(initial ?? {}) });
    setCompanyError(false);
  }, [open, initial, defaultAssignee]);

  function update<K extends keyof ProspectFormValues>(key: K, value: ProspectFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setCompanyError(true);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

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
        {isEdit ? 'Save changes' : 'Add prospect'}
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit prospect' : 'Add prospect'}
      footer={footer}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <Input
          label="Company name"
          required
          value={form.company_name}
          error={companyError ? 'Company name is required' : undefined}
          onChange={e => {
            update('company_name', e.target.value);
            if (companyError) setCompanyError(false);
          }}
        />
        <div className="drawer-row">
          <Input
            label="Contact name"
            value={form.contact_name}
            onChange={e => update('contact_name', e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
          />
        </div>
        <div className="drawer-row">
          <Input
            label="Phone"
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
          />
          <Input
            label="Website"
            placeholder="https://..."
            value={form.website}
            onChange={e => update('website', e.target.value)}
          />
        </div>
        <div className="drawer-row">
          <Input
            label="Sector"
            value={form.sector}
            onChange={e => update('sector', e.target.value)}
          />
          <Input
            label="Region"
            value={form.region}
            onChange={e => update('region', e.target.value)}
          />
        </div>

        <Input
          label="Tender title"
          value={form.tender_title}
          onChange={e => update('tender_title', e.target.value)}
        />
        <Input
          label="Tender URL"
          placeholder="https://..."
          value={form.tender_url}
          onChange={e => update('tender_url', e.target.value)}
        />
        <div className="drawer-row">
          <Input
            label="Tender reference"
            value={form.tender_reference}
            onChange={e => update('tender_reference', e.target.value)}
          />
          <div className="field">
            <label className="field-label">Tender value</label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={form.tender_value}
                onChange={e => update('tender_value', e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="drawer-row">
          <Input
            label="Submission deadline"
            type="date"
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
        <Input
          label="Buyer / Contracting Authority"
          value={form.buyer}
          onChange={e => update('buyer', e.target.value)}
        />

        <Select
          label="Status"
          value={form.status}
          onValueChange={v => update('status', v as ProspectStatus)}
          options={STATUS_OPTIONS}
        />

        <div className="drawer-row">
          <Input
            label="Last contact"
            type="date"
            value={form.last_contact_date}
            onChange={e => update('last_contact_date', e.target.value)}
          />
          <Input
            label="Next follow-up"
            type="date"
            value={form.next_followup_date}
            onChange={e => update('next_followup_date', e.target.value)}
          />
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
