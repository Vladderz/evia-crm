interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog">
        <h3 id="dialog-title" className="dialog-title">{title}</h3>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
