import { useEffect, useState } from 'react';
import api from '../lib/api';
import type { Note } from '../lib/types';
import { Drawer } from './Drawer/Drawer';
import { Textarea } from './Textarea/Textarea';
import { Button } from './Button/Button';
import { Badge } from './Badge/Badge';
import { useToast } from './ToastProvider';

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityType: 'pipeline' | 'tender' | 'client';
  entityId: number | null;
}

const ENDPOINTS: Record<string, string> = {
  pipeline: '/pipeline',
  tender: '/tenders',
  client: '/clients',
};

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotesPanel({ isOpen, onClose, title, entityType, entityId }: NotesPanelProps) {
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || entityId === null) {
      setNotes([]);
      return;
    }
    setLoading(true);
    api.get(`${ENDPOINTS[entityType]}/${entityId}/notes`)
      .then(res => setNotes(res.data))
      .catch(() => toast.error('Failed to load notes'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entityId, entityType]);

  async function handleSubmit() {
    if (!newNote.trim() || entityId === null) return;
    setSubmitting(true);
    try {
      const res = await api.post(`${ENDPOINTS[entityType]}/${entityId}/notes`, { note: newNote.trim() });
      setNotes(prev => [res.data, ...prev]);
      setNewNote('');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={isOpen} onClose={onClose} title={title}>
      <div className="notes-add-row">
        <Textarea
          rows={2}
          placeholder="Add a note..."
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!newNote.trim()}
        >
          Add note
        </Button>
      </div>

      <div className="notes-timeline">
        {loading ? (
          <p className="notes-timeline-state">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="notes-timeline-state">No notes yet</p>
        ) : (
          notes.map(note => {
            const isSystem = note.note_type === 'system';
            return (
              <div key={note.id} className="notes-entry">
                <div className="notes-entry-meta">
                  <span className="notes-entry-author">
                    {isSystem ? 'System' : note.created_by_name}
                  </span>
                  {isSystem && (
                    <Badge variant="info" size="sm">System</Badge>
                  )}
                  <span className="notes-entry-date">
                    {formatNoteDate(note.created_at)}
                  </span>
                </div>
                <div className="notes-entry-text">{note.note}</div>
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
}
