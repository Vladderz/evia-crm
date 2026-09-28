import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Input } from '../Input/Input';
import { Button } from '../Button/Button';

interface VoidInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function VoidInvoiceDialog({
  open,
  onClose,
  onConfirm,
}: VoidInvoiceDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  }

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
