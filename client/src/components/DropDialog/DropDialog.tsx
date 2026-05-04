import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Select } from '../Select/Select';
import { Textarea } from '../Textarea/Textarea';
import { Button } from '../Button/Button';
import { DROP_REASON_OPTIONS } from '../../lib/format';
import type { DropReason } from '../../lib/types';

interface DropDialogProps {
  open: boolean;
  /** Display name of the thing being dropped (company, tender title). */
  entityName: string;
  /** Tender or Prospect - drives the title wording. */
  entityKind: 'tender' | 'prospect';
  onClose: () => void;
  onConfirm: (payload: { reason: DropReason; note: string }) => Promise<void> | void;
}

export function DropDialog({
  open,
  entityName,
  entityKind,
  onClose,
  onConfirm,
}: DropDialogProps) {
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [reasonError, setReasonError] = useState(false);

  /* Reset state every time the dialog opens. */
  useEffect(() => {
    if (open) {
      setReason('');
      setNote('');
      setSubmitting(false);
      setReasonError(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!reason) {
      setReasonError(true);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason as DropReason, note });
    } finally {
      setSubmitting(false);
    }
  }

  const title = entityKind === 'tender' ? 'Drop tender to No Man\'s Land' : 'Drop prospect to No Man\'s Land';
  const description = `${entityName} will move to No Man's Land. You can re-engage them later from there - the relationship stays alive.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={submitting}>
        Drop
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Select
          label="Reason"
          value={reason}
          onValueChange={v => {
            setReason(v);
            if (reasonError) setReasonError(false);
          }}
          options={DROP_REASON_OPTIONS}
          placeholder="Choose a reason"
          error={reasonError ? 'Pick a reason before dropping' : undefined}
        />
        <Textarea
          label="Note (optional)"
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything worth remembering when this row resurfaces"
        />
      </div>
    </Modal>
  );
}
