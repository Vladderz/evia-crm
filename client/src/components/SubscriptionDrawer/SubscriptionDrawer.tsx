import { useEffect, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Button } from '../Button/Button';
import type {
  SubscriptionCategory,
  SubscriptionCycle,
  SubscriptionOwner,
  SubscriptionStatus,
} from '../../lib/types';

export interface SubscriptionFormValues {
  service_name: string;
  owner: SubscriptionOwner;
  amount: string;
  billing_cycle: SubscriptionCycle;
  renewal_anchor_date: string;
  payment_method: string;
  /** '' means "no category" - translated to null at the API boundary. */
  category: SubscriptionCategory | '';
  management_url: string;
  account_email: string;
  status: SubscriptionStatus;
  notes: string;
}

interface SubscriptionDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Absent = Add mode. Present (even if empty object) = Edit mode. */
  initial?: Partial<SubscriptionFormValues> | null;
  onSave: (values: SubscriptionFormValues) => Promise<void> | void;
}

const EMPTY: SubscriptionFormValues = {
  service_name: '',
  owner: 'evia_consultancy',
  amount: '',
  billing_cycle: 'monthly',
  renewal_anchor_date: '',
  payment_method: 'Tide Business',
  category: '',
  management_url: '',
  account_email: '',
  status: 'active',
  notes: '',
};

const OWNER_OPTIONS = [
  { value: 'evia_consultancy', label: 'Evia Consultancy' },
  { value: 'vlad',             label: 'Vlad Lewis' },
  { value: 'tristan',          label: 'Tristan Walker' },
];

const CYCLE_OPTIONS = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual',    label: 'Annual' },
];

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active' },
  { value: 'paused',    label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Radix SelectItem forbids value="". This sentinel stands in for
// "no category" in the dropdown and is translated back to '' before
// hitting form state. The parent then maps '' -> null at the API
// boundary.
const NO_CATEGORY_SENTINEL = '__none__';

const CATEGORY_OPTIONS = [
  { value: NO_CATEGORY_SENTINEL, label: 'No category' },
  { value: 'AI Tools',       label: 'AI Tools' },
  { value: 'Infrastructure', label: 'Infrastructure' },
  { value: 'Productivity',   label: 'Productivity' },
  { value: 'Other',          label: 'Other' },
];

export function SubscriptionDrawer({
  open,
  onClose,
  initial,
  onSave,
}: SubscriptionDrawerProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<SubscriptionFormValues>(() => ({
    ...EMPTY,
    ...(initial ?? {}),
  }));
  const [errors, setErrors] = useState<{ [K in keyof SubscriptionFormValues]?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...(initial ?? {}) });
    setErrors({});
  }, [open, initial]);

  function update<K extends keyof SubscriptionFormValues>(key: K, value: SubscriptionFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.service_name.trim()) next.service_name = 'Service name is required';
    const amountNum = parseFloat(form.amount);
    if (!form.amount || !Number.isFinite(amountNum) || amountNum < 0) {
      next.amount = 'Amount is required';
    }
    if (!form.renewal_anchor_date) next.renewal_anchor_date = 'Renewal date is required';
    if (Object.keys(next).length > 0) {
      setErrors(next);
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
        {isEdit ? 'Save changes' : 'Add subscription'}
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit subscription' : 'Add subscription'}
      footer={footer}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <Input
          label="Service name"
          required
          value={form.service_name}
          error={errors.service_name}
          onChange={e => update('service_name', e.target.value)}
        />

        <Select
          label="Owner"
          value={form.owner}
          onValueChange={v => update('owner', v as SubscriptionOwner)}
          options={OWNER_OPTIONS}
        />

        <div className="drawer-row">
          <div className="field">
            <label className="field-label">
              Amount
              <span className="field-required" aria-hidden>*</span>
            </label>
            <div className="drawer-currency">
              <span className="drawer-currency-prefix">£</span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => update('amount', e.target.value)}
                aria-invalid={!!errors.amount || undefined}
              />
            </div>
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>

          <Select
            label="Billing cycle"
            value={form.billing_cycle}
            onValueChange={v => update('billing_cycle', v as SubscriptionCycle)}
            options={CYCLE_OPTIONS}
          />
        </div>

        <Input
          label="Renewal date"
          type="date"
          required
          value={form.renewal_anchor_date}
          error={errors.renewal_anchor_date}
          hint={!errors.renewal_anchor_date
            ? 'Any past or upcoming charge date. The next renewal is worked out from this.'
            : undefined}
          onChange={e => update('renewal_anchor_date', e.target.value)}
        />

        <div className="drawer-row">
          <Input
            label="Payment method"
            value={form.payment_method}
            onChange={e => update('payment_method', e.target.value)}
          />
          <Select
            label="Category"
            value={form.category === '' ? NO_CATEGORY_SENTINEL : form.category}
            onValueChange={v =>
              update(
                'category',
                v === NO_CATEGORY_SENTINEL ? '' : (v as SubscriptionCategory),
              )
            }
            options={CATEGORY_OPTIONS}
          />
        </div>

        <Input
          label="Billing page URL"
          placeholder="https://..."
          value={form.management_url}
          onChange={e => update('management_url', e.target.value)}
        />

        <Input
          label="Account email"
          type="email"
          hint="Only needed where the service name alone is ambiguous."
          value={form.account_email}
          onChange={e => update('account_email', e.target.value)}
        />

        <Select
          label="Status"
          value={form.status}
          onValueChange={v => update('status', v as SubscriptionStatus)}
          options={STATUS_OPTIONS}
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
