import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Input } from '../Input/Input';
import { Button } from '../Button/Button';

interface ShortlistDialogProps {
  open: boolean;
  /** Tender title - shown in the modal description for context. */
  tenderTitle: string;
  onClose: () => void;
  onConfirm: (payload: { ittDeadline: string }) => Promise<void> | void;
}

export function ShortlistDialog({
  open,
  tenderTitle,
  onClose,
  onConfirm,
}: ShortlistDialogProps) {
  const [ittDeadline, setIttDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setIttDeadline('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm({ ittDeadline: ittDeadline.trim() });
    } finally {
      setSubmitting(false);
    }
  }

  const description = `${tenderTitle} moves back to Info Gathering as an ITT. The PSQ date is kept in its notes.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm} loading={submitting}>
        Mark Shortlisted
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Shortlisted for the ITT"
      description={description}
      size="sm"
      footer={footer}
    >
      <Input
        label="ITT deadline"
        type="datetime-local"
        value={ittDeadline}
        hint="Leave blank if it isn't known yet"
        onChange={e => setIttDeadline(e.target.value)}
      />
    </Modal>
  );
}
