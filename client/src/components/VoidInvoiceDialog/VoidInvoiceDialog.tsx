import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Input } from '../Input/Input';
import { Button } from '../Button/Button';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { formatMoney } from '../../lib/format';

export type VoidScope = 'item' | 'invoice';

interface VoidInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, scope: VoidScope) => Promise<void> | void;
  /**
   * When the invoice being voided has more than one item, pass this
   * to show the scope choice. When absent (or itemCount <= 1) the
   * dialog acts on a single item as before.
   */
  multiItem?: {
    invoiceNumber: string | null;
    itemCount: number;
    itemTotal: number | string;
    invoiceTotal: number | string;
    /** 'item' shows the item-only choice as default; 'invoice' the whole. */
    defaultScope?: VoidScope;
    /** When true, the choice is fixed and the segmented control is hidden. */
    forceInvoiceScope?: boolean;
  } | null;
}

export function VoidInvoiceDialog({
  open,
  onClose,
  onConfirm,
  multiItem,
}: VoidInvoiceDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scope, setScope] = useState<VoidScope>(multiItem?.defaultScope ?? 'item');

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setSubmitting(false);
      if (multiItem?.forceInvoiceScope) setScope('invoice');
      else setScope(multiItem?.defaultScope ?? 'item');
    }
  }, [open, multiItem]);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason.trim(), scope);
    } finally {
      setSubmitting(false);
    }
  }

  const showChoice =
    !!multiItem && multiItem.itemCount > 1 && !multiItem.forceInvoiceScope;
  const scopeOptions: { value: VoidScope; label: string }[] = showChoice
    ? [
        {
          value: 'item',
          label: `Just this item (${multiItem!.invoiceNumber ?? 'this invoice'} becomes ${formatMoney(
            (Number(multiItem!.invoiceTotal) || 0) - (Number(multiItem!.itemTotal) || 0),
          )})`,
        },
        {
          value: 'invoice',
          label: `The whole invoice (all ${multiItem!.itemCount} items, ${formatMoney(multiItem!.invoiceTotal)})`,
        },
      ]
    : [];

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={submitting}>
        Void invoice
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Void invoice"
      description="A voided invoice stays on record but drops out of every total. Cancel a sent invoice with a credit note and record its number here."
      size="sm"
      footer={footer}
    >
      {showChoice && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="field-label">Scope</label>
          <SegmentedControl<VoidScope>
            options={scopeOptions}
            value={scope}
            onChange={setScope}
            ariaLabel="Void scope"
            fullWidth
          />
        </div>
      )}
      <Input
        label="Reason"
        required
        placeholder="Credit note CN-001"
        value={reason}
        error={error ?? undefined}
        onChange={e => {
          setReason(e.target.value);
          if (error) setError(null);
        }}
      />
    </Modal>
  );
}
