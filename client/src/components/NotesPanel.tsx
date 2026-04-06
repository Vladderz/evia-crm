import { useState, useEffect } from 'react'
import api from '../lib/api'
import type { Note } from '../lib/types'
import SlidePanel from './SlidePanel'
import { useToast } from './ToastProvider'

interface NotesPanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  entityType: 'pipeline' | 'tender' | 'client'
  entityId: number | null
}

const ENDPOINTS: Record<string, string> = {
  pipeline: '/pipeline',
  tender: '/tenders',
  client: '/clients',
}

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotesPanel({ isOpen, onClose, title, entityType, entityId }: NotesPanelProps) {
  const toast = useToast()
  const [notes, setNotes] = useState<Note[]>([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen || entityId === null) {
      setNotes([])
      return
    }
    setLoading(true)
    api.get(`${ENDPOINTS[entityType]}/${entityId}/notes`)
      .then(res => setNotes(res.data))
      .catch(() => toast.error('Failed to load notes'))
      .finally(() => setLoading(false))
  }, [isOpen, entityId, entityType]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!newNote.trim() || entityId === null) return
    setSubmitting(true)
    try {
      const res = await api.post(`${ENDPOINTS[entityType]}/${entityId}/notes`, { note: newNote.trim() })
      setNotes(prev => [res.data, ...prev])
      setNewNote('')
    } catch {
      toast.error('Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SlidePanel open={isOpen} onClose={onClose} title={title}>
      <div className="note-input-row">
        <textarea
          rows={2}
          placeholder="Add a note..."
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !newNote.trim()}
        >
          Add Note
        </button>
      </div>
      <div className="notes-timeline">
        {loading ? (
          <p className="notes-empty">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="notes-empty">No notes yet</p>
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              className={`note-entry${note.note_type === 'system' ? ' note-system' : ''}`}
            >
              <div className="note-meta">
                <strong>
                  {note.note_type === 'system' ? 'System' : note.created_by_name}
                </strong>
                {' - '}
                {formatNoteDate(note.created_at)}
              </div>
              <div className="note-text">{note.note}</div>
            </div>
          ))
        )}
      </div>
    </SlidePanel>
  )
}
