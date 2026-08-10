import { useEffect, useState } from 'react';
import { Drawer } from '../Drawer/Drawer';
import { Input } from '../Input/Input';
import { Textarea } from '../Textarea/Textarea';
import { Select } from '../Select/Select';
import { Button } from '../Button/Button';

export type ClientStatus = 'active_client' | 'seeking_tender' | 'prospect';
export type AccountManager = 'vlad' | 'tristan' | 'both';

export interface ClientFormValues {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  sector: string;
  region: string;
  status: ClientStatus;
  account_manager: AccountManager;
  notes: string;
}

interface ClientDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Initial values - if absent, drawer renders in Add mode. */
  initial?: Partial<ClientFormValues> | null;
  onSave: (values: ClientFormValues) => Promise<void> | void;
}

const EMPTY: ClientFormValues = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  sector: '',
  region: '',
  status: 'prospect',
  account_manager: 'vlad',
  notes: '',
};

const STATUS_OPTIONS = [
  { value: 'prospect',       label: 'Prospect' },
  { value: 'active_client',  label: 'Active Client' },
  { value: 'seeking_tender', label: 'Seeking Tender' },
];

const MANAGER_OPTIONS = [
  { value: 'vlad',    label: 'Vlad' },
  { value: 'tristan', label: 'Tristan' },
  { value: 'both',    label: 'Both' },
];

export function ClientDrawer({ open, onClose, initial, onSave }: ClientDrawerProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ClientFormValues>(() => ({ ...EMPTY, ...(initial ?? {}) }));
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...(initial ?? {}) });
    setNameError(false);
  }, [open, initial]);

  function update<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setNameError(true);
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
        {isEdit ? 'Save changes' : 'Add client'}
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit client' : 'Add client'}
      footer={footer}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
        <Input
          label="Company name"
          required
          value={form.company_name}
          error={nameError ? 'Company name is required' : undefined}
          onChange={e => {
            update('company_name', e.target.value);
            if (nameError) setNameError(false);
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
            placeholder="e.g. Commercial Cleaning, Electrical"
            value={form.sector}
            onChange={e => update('sector', e.target.value)}
          />
          <Input
            label="Region"
            placeholder="e.g. London, South East, Nationwide"
            value={form.region}
            onChange={e => update('region', e.target.value)}
          />
        </div>

        <Select
          label="Status"
          value={form.status}
          onValueChange={v => update('status', v as ClientStatus)}
          options={STATUS_OPTIONS}
        />

        <Select
          label="Account manager"
          value={form.account_manager}
          onValueChange={v => update('account_manager', v as AccountManager)}
          options={MANAGER_OPTIONS}
        />

        <Textarea
          label="Notes"
          rows={4}
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
        />
      </form>
    </Drawer>
  );
}
