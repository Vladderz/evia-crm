import { Select } from '../Select/Select';

export interface ClientOption {
  id: number;
  name: string;
  // Optional company-info fields, used by ProspectDrawer to prefill.
  // ClientPicker itself only reads id + name.
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  sector?: string | null;
  region?: string | null;
}

// Legacy alias kept so TenderDrawer's original type name still resolves.
export type TenderClientOption = ClientOption;

// Radix Select.Item forbids value="". Sentinel stands in for the
// "no client / new" option; callers see '' in state either way.
const NO_CLIENT_SENTINEL = '__no_client__';

interface ClientPickerProps {
  clients: ClientOption[];
  /** client_id as string, or '' when nothing is picked. */
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Text for the empty / "no selection" option. */
  emptyLabel?: string;
  disabled?: boolean;
}

export function ClientPicker({
  clients,
  value,
  onChange,
  label,
  emptyLabel = 'No client',
  disabled,
}: ClientPickerProps) {
  const options = [
    { value: NO_CLIENT_SENTINEL, label: emptyLabel },
    ...clients.map(c => ({ value: String(c.id), label: c.name })),
  ];
  return (
    <Select
      label={label}
      value={value || NO_CLIENT_SENTINEL}
      onValueChange={v => onChange(v === NO_CLIENT_SENTINEL ? '' : v)}
      options={options}
      placeholder={emptyLabel}
      disabled={disabled}
    />
  );
}
