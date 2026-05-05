import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Textarea } from '../Textarea/Textarea';
import { Button } from '../Button/Button';

interface MarkLostDialogProps {
  open: boolean;
  /** Tender title - shown in the modal description for context. */
  tenderTitle: string;
  onClose: () => void;
  onConfirm: (payload: { lossNote: string }) => Promise<void> | void;
}

export function MarkLostDialog({
  open,
  tenderTitle,
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

  const description = `${tenderTitle} will be marked as Lost. This is a final outcome - the row will leave Active and surface in the Lost tab.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={submitting}>
        Mark as Lost
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Mark tender as Lost"
      description={description}
      size="sm"
      footer={footer}
    >
      <Textarea
        label="Loss reason (optional)"
        rows={3}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Anything worth remembering for win/loss analysis later"
      />
    </Modal>
  );
}
