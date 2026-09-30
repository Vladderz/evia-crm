import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Textarea } from '../Textarea/Textarea';
import { Button } from '../Button/Button';
import type { BidStage, ProcurementType } from '../../lib/types';

interface MarkLostDialogProps {
  open: boolean;
  /** Tender title - shown in the modal description for context. */
  tenderTitle: string;
  /** Type of the record. DPS records read "Not Admitted" in place of
   *  "Lost" throughout. Default preserves the pre-DPS behaviour. */
  procurementType?: ProcurementType;
  /** Round of the bid. On a non-DPS PSQ, the dialog reads as
   *  "Not Shortlisted" instead of "Lost". Absent = default behaviour. */
  bidStage?: BidStage;
  onClose: () => void;
  onConfirm: (payload: { lossNote: string }) => Promise<void> | void;
}

export function MarkLostDialog({
  open,
  tenderTitle,
  procurementType = 'tender',
  bidStage,
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
  const isPsq = !isDps && bidStage === 'psq';

  let title: string;
  let description: string;
  let confirmLabel: string;
  let noteLabel: string;

  if (isPsq) {
    title = 'Not shortlisted';
    description = "This PSQ didn't make the shortlist. It moves to Lost and stays out of the win rate.";
    confirmLabel = 'Mark Not Shortlisted';
    noteLabel = 'Reason (optional)';
  } else if (isDps) {
    title = 'Mark DPS application as Not Admitted';
    description = `${tenderTitle} will be marked as Not Admitted. This is a final outcome - the row will leave Active and surface in the Not Admitted tab.`;
    confirmLabel = 'Mark as Not Admitted';
    noteLabel = 'Reason (optional)';
  } else {
    title = 'Mark tender as Lost';
    description = `${tenderTitle} will be marked as Lost. This is a final outcome - the row will leave Active and surface in the Lost tab.`;
    confirmLabel = 'Mark as Lost';
    noteLabel = 'Loss reason (optional)';
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={submitting}>
        {confirmLabel}
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
        label={noteLabel}
        rows={3}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Anything worth remembering for win/loss analysis later"
      />
    </Modal>
  );
}
