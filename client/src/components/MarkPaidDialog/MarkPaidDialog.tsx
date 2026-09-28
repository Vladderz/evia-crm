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
  onConfirm: (payload: {
    paid_date: string;
    amount_received: string;
    tide_transaction_id: string;
    payment_evidence_file: string;
  }) => Promise<void> | void;
}

export function MarkPaidDialog({
  open,
  invoice,
  onClose,
  onConfirm,
}: MarkPaidDialogProps) {
  const totalStr = invoice != null
    ? String(parseFloat(String(invoice.total)).toFixed(2))
    : '';
  const [paidDate, setPaidDate] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [tideId, setTideId] = useState('');
  const [evidenceFile, setEvidenceFile] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidDate(todayLondon());
      setAmountReceived(totalStr);
      setTideId('');
      setEvidenceFile('');
      setSubmitting(false);
    }
  }, [open, totalStr]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm({
        paid_date: paidDate,
        amount_received: amountReceived,
        tide_transaction_id: tideId,
        payment_evidence_file: evidenceFile,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const totalNum = parseFloat(totalStr);
  const receivedNum = parseFloat(amountReceived);
  let differenceHint: string | null = null;
  if (Number.isFinite(totalNum) && Number.isFinite(receivedNum) && receivedNum !== totalNum) {
    const diff = Math.round((receivedNum - totalNum) * 100) / 100;
    if (diff < 0) {
      differenceHint = `${formatMoney(Math.abs(diff))} short of the invoice total`;
    } else if (diff > 0) {
      differenceHint = `${formatMoney(diff)} more than the invoice total`;
    }
  }

  const description = invoice
    ? `${invoice.invoice_number ?? 'This invoice'}, ${invoice.client_name}, ${formatMoney(invoice.total)}`
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
        onChange={e => setPaidDate(e.target.value)}
      />
      <div className="field">
        <label className="field-label">Amount received</label>
        <div className="drawer-currency">
          <span className="drawer-currency-prefix">£</span>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder={totalStr || '0.00'}
            value={amountReceived}
            onChange={e => setAmountReceived(e.target.value)}
          />
        </div>
        {differenceHint && (
          <span className="field-hint">{differenceHint}</span>
        )}
      </div>
      <Input
        label="Tide transaction ID"
        value={tideId}
        onChange={e => setTideId(e.target.value)}
      />
      <Input
        label="Payment evidence file"
        value={evidenceFile}
        onChange={e => setEvidenceFile(e.target.value)}
      />
    </Modal>
  );
}
