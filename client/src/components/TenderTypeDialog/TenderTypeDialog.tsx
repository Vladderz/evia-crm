import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import type { ProcurementType } from '../../lib/types';

interface TenderTypeDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Optional busy flag; when true the confirm button shows the
   *  Button loading spinner and both actions disable. */
  busy?: boolean;
  onClose: () => void;
  onConfirm: (procurementType: ProcurementType) => Promise<void> | void;
}

const TYPE_OPTIONS: { value: ProcurementType; label: string }[] = [
  { value: 'tender',    label: 'Tender' },
  { value: 'framework', label: 'Framework' },
  { value: 'dps',       label: 'DPS' },
];

export function TenderTypeDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onClose,
  onConfirm,
}: TenderTypeDialogProps) {
  const [type, setType] = useState<ProcurementType>('tender');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setType('tender');
      setSubmitting(false);
    }
  }, [open]);

  const busyState = busy || submitting;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(type);
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busyState}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm} loading={busyState}>
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !busyState && onClose()}
      title={title}
      description={description}
      size="sm"
      footer={footer}
    >
      <div className="field">
        <label className="field-label">Type</label>
        <SegmentedControl<ProcurementType>
          options={TYPE_OPTIONS}
          value={type}
          onChange={setType}
          ariaLabel="Type"
          fullWidth
        />
        {type === 'dps' && (
          <span className="field-hint">
            Includes dynamic markets. Not counted in the win rate.
          </span>
        )}
      </div>
    </Modal>
  );
}
