import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Textarea } from '../Textarea/Textarea';
import { Button } from '../Button/Button';
import type { ProcurementType } from '../../lib/types';

interface MarkLostDialogProps {
  open: boolean;
  /** Tender title - shown in the modal description for context. */
  tenderTitle: string;
  /** Type of the record. DPS records read "Not Admitted" in place of
   *  "Lost" throughout. Default preserves the pre-DPS behaviour. */
  procurementType?: ProcurementType;
  onClose: () => void;
  onConfirm: (payload: { lossNote: string }) => Promise<void> | void;
}

export function MarkLostDialog({
  open,
  tenderTitle,
  procurementType = 'tender',
  onClose,
  onConfirm,
}: MarkLostDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm({ lossNote: note.trim() });
    } finally {
      setSubmitting(false);
    }
  }

  const isDps = procurementType === 'dps';
  const outcomeLabel = isDps ? 'Not Admitted' : 'Lost';
  const outcomeTab = isDps ? 'Not Admitted' : 'Lost';
  const title = isDps ? 'Mark DPS application as Not Admitted' : 'Mark tender as Lost';
  const description = `${tenderTitle} will be marked as ${outcomeLabel}. This is a final outcome - the row will leave Active and surface in the ${outcomeTab} tab.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={submitting}>
        {isDps ? 'Mark as Not Admitted' : 'Mark as Lost'}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={title}
      description={description}
      size="sm"
      footer={footer}
    >
      <Textarea
        label={isDps ? 'Reason (optional)' : 'Loss reason (optional)'}
        rows={3}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Anything worth remembering for win/loss analysis later"
      />
    </Modal>
  );
}
