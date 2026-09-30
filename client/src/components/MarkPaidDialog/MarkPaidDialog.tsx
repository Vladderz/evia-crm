import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Input } from '../Input/Input';
import { Button } from '../Button/Button';
import { formatMoney, todayLondon } from '../../lib/format';
import type { Invoice } from '../../lib/types';

interface MarkPaidDialogProps {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onConfirm: (payload: { paid_date: string }) => Promise<void> | void;
  /**
   * Optional summary for a multi-item invoice. When present, the
   * dialog's description reads "All N items on INV-007, £X,XXX.XX"
   * instead of just the single row's number and total.
   */
  groupSummary?: {
    invoiceNumber: string | null;
    itemCount: number;
    total: number | string;
  } | null;
}

export function MarkPaidDialog({
  open,
  invoice,
  onClose,
  onConfirm,
  groupSummary,
}: MarkPaidDialogProps) {
  const [paidDate, setPaidDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidDate(todayLondon());
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (invoice && invoice.issue_date && paidDate && paidDate < invoice.issue_date) {
      setError(`Date paid can't be before the issue date`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm({ paid_date: paidDate });
    } finally {
      setSubmitting(false);
    }
  }

  const description = invoice
    ? (groupSummary && groupSummary.itemCount > 1
        ? `All ${groupSummary.itemCount} items on ${groupSummary.invoiceNumber ?? 'this invoice'}, ${formatMoney(groupSummary.total)}`
        : `${invoice.invoice_number ?? 'This invoice'}, ${invoice.client_name}, ${formatMoney(invoice.total)}`)
    : '';

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm} loading={submitting}>
        Mark paid
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Mark paid"
      description={description}
      size="sm"
      footer={footer}
    >
      <Input
        label="Date paid"
        type="date"
        value={paidDate}
        error={error ?? undefined}
        onChange={e => {
          setPaidDate(e.target.value);
          if (error) setError(null);
        }}
      />
    </Modal>
  );
}
