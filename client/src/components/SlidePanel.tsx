import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function SlidePanel({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <>
      <div
        className={`panel-overlay ${open ? 'panel-overlay-visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`slide-panel ${open ? 'slide-panel-open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="slide-panel-header">
          <h2 className="slide-panel-title">{title}</h2>
          <button className="slide-panel-close" onClick={onClose} aria-label="Close panel">
            &times;
          </button>
        </div>
        <div className="slide-panel-body">
          {children}
        </div>
      </div>
    </>
  )
}
