import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';

export type ReEngageTarget = 'pipeline' | 'active_tenders';

interface ReEngageDialogProps {
  open: boolean;
  /** What is being re-engaged. Drives which targets are valid. */
  source: 'tender' | 'prospect';
  /** Display name (company / tender title). */
  entityName: string;
  onClose: () => void;
  onConfirm: (target: ReEngageTarget) => Promise<void> | void;
}

export function ReEngageDialog({
  open,
  source,
  entityName,
  onClose,
  onConfirm,
}: ReEngageDialogProps) {
  const pipelineEnabled = source === 'prospect';
  const [target, setTarget] = useState<ReEngageTarget>('active_tenders');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget(pipelineEnabled ? 'pipeline' : 'active_tenders');
      setSubmitting(false);
    }
  }, [open, pipelineEnabled]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(target);
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm} loading={submitting}>
        Re-engage
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={`Re-engage ${entityName}`}
      description="Where should this row land?"
      size="sm"
      footer={footer}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ReEngageOption
          checked={target === 'pipeline'}
          disabled={!pipelineEnabled}
          onClick={() => pipelineEnabled && setTarget('pipeline')}
          label="Back to Sales Pipeline"
          hint={
            pipelineEnabled
              ? 'Status reverts to Contacted, follow-up scheduled in 3 days'
              : 'Only available for dropped prospects'
          }
        />
        <ReEngageOption
          checked={target === 'active_tenders'}
          disabled={false}
          onClick={() => setTarget('active_tenders')}
          label="Push to Active Tenders"
          hint={
            source === 'prospect'
              ? 'Promotes to a client + new tender at Writing'
              : 'Status reverts to Writing'
          }
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- */

interface ReEngageOptionProps {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}

function ReEngageOption({
  checked,
  disabled,
  onClick,
  label,
  hint,
}: ReEngageOptionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`reengage-option${checked ? ' reengage-option-checked' : ''}`}
      aria-pressed={checked}
    >
      <span
        className={`reengage-radio${checked ? ' reengage-radio-checked' : ''}`}
        aria-hidden
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary-v1)' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{hint}</span>
      </span>
    </button>
  );
}
