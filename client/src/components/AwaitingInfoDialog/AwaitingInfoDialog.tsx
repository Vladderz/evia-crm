import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Textarea } from '../Textarea/Textarea';
import { Button } from '../Button/Button';

interface AwaitingInfoDialogProps {
  open: boolean;
  /** Tender title - shown in the modal description for context. */
  tenderTitle: string;
  onClose: () => void;
  onConfirm: (payload: { note: string }) => Promise<void> | void;
}

export function AwaitingInfoDialog({
  open,
  tenderTitle,
  onClose,
  onConfirm,
}: AwaitingInfoDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noteError, setNoteError] = useState(false);

  useEffect(() => {
    if (open) {
      setNote('');
      setSubmitting(false);
      setNoteError(false);
    }
  }, [open]);

  async function handleConfirm() {
    const trimmed = note.trim();
    if (!trimmed) {
      setNoteError(true);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({ note: trimmed });
    } finally {
      setSubmitting(false);
    }
  }

  const description = `${tenderTitle} will be flagged as awaiting client input. The note appears on the row tooltip until you clear it.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm} loading={submitting}>
        Mark Awaiting Info
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Mark Awaiting Info"
      description={description}
      size="sm"
      footer={footer}
    >
      <Textarea
        label="What information are you waiting on?"
        rows={3}
        required
        value={note}
        error={noteError ? 'A short note is required so the team knows what we are blocked on' : undefined}
        onChange={e => {
          setNote(e.target.value);
          if (noteError) setNoteError(false);
        }}
        placeholder="e.g. Awaiting completed PQQ from buyer; need clarification on TUPE staff list"
      />
    </Modal>
  );
}
