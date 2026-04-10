interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  loadingLabel?: string
  confirmClassName?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  loading = false, loadingLabel, confirmClassName = 'btn btn-danger',
  onConfirm, onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog">
        <h3 id="dialog-title" className="dialog-title">{title}</h3>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={confirmClassName} onClick={onConfirm} disabled={loading}>
            {loading ? (loadingLabel || 'Loading...') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
