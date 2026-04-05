import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import api from '../lib/api'
import type { Client, Tender } from '../lib/types'
import { useToast } from './ToastProvider'

interface Props {
  tender: Tender | null
  clients: Client[]
  currentUserName: string
  onSuccess: () => void
  onClose: () => void
}

interface FormState {
  client_id: string
  title: string
  buyer: string
  estimated_value: string
  evia_fee: string
  submission_deadline: string
  portal: string
  reference_number: string
  sector: string
  tender_url: string
  status: string
  assigned_to: string
  notes: string
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  // Keep YYYY-MM-DDTHH:mm - strip seconds and timezone
  return iso.slice(0, 16)
}

function calcAutoFee(valueStr: string): string {
  const val = parseFloat(valueStr)
  if (!valueStr || isNaN(val) || val <= 0) return ''
  return String(Math.round(Math.max(val * 0.03, 2000)))
}

const ADD_STATUSES = [
  { value: 'questionnaire_sent', label: 'Questionnaire Sent' },
  { value: 'writing', label: 'Writing' },
  { value: 'submitted', label: 'Submitted / Awaiting Result' },
]

const EDIT_STATUSES = [
  ...ADD_STATUSES,
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

export default function TenderForm({ tender, clients, currentUserName, onSuccess, onClose }: Props) {
  const toast = useToast()

  const feeManuallyEdited = useRef(false)

  const emptyForm = (): FormState => ({
    client_id: '',
    title: '',
    buyer: '',
    estimated_value: '',
    evia_fee: '',
    submission_deadline: '',
    portal: '',
    reference_number: '',
    sector: '',
    tender_url: '',
    status: 'questionnaire_sent',
    assigned_to: currentUserName,
    notes: '',
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [titleError, setTitleError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refDuplicate, setRefDuplicate] = useState<{ title: string; id: number } | null>(null)
  const [urlDuplicate, setUrlDuplicate] = useState<{ title: string; id: number } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractStatus, setExtractStatus] = useState<'loading' | 'success' | 'error' | null>(null)

  // Reset form when switching between add and edit modes
  useEffect(() => {
    if (tender) {
      feeManuallyEdited.current = true
      setForm({
        client_id: tender.client_id ? String(tender.client_id) : '',
        title: tender.title,
        buyer: tender.buyer ?? '',
        estimated_value: tender.estimated_value ? String(tender.estimated_value) : '',
        evia_fee: tender.evia_fee ? String(Math.round(tender.evia_fee)) : '',
        submission_deadline: toDatetimeLocal(tender.submission_deadline),
        portal: tender.portal ?? '',
        reference_number: tender.reference_number ?? '',
        sector: tender.sector ?? '',
        tender_url: tender.tender_url ?? '',
        status: tender.status,
        assigned_to: tender.assigned_to ?? '',
        notes: tender.notes ?? '',
      })
    } else {
      feeManuallyEdited.current = false
      setForm(emptyForm())
    }
    setTitleError(false)
    setRefDuplicate(null)
    setUrlDuplicate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tender, currentUserName])

  function handleField(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target

    if (name === 'evia_fee') {
      if (value === '') {
        feeManuallyEdited.current = false
      } else {
        feeManuallyEdited.current = true
      }
      setForm(prev => ({ ...prev, evia_fee: value }))
      return
    }

    if (name === 'estimated_value') {
      setForm(prev => {
        const next = { ...prev, estimated_value: value }
        if (!feeManuallyEdited.current) {
          next.evia_fee = calcAutoFee(value)
        }
        return next
      })
      return
    }

    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'title') setTitleError(false)
  }

  async function checkRefDuplicate() {
    if (!form.reference_number.trim()) {
      setRefDuplicate(null)
      return
    }
    try {
      const res = await api.get('/tenders/check-duplicate', { params: { reference: form.reference_number } })
      if (res.data.exists && res.data.id !== tender?.id) {
        setRefDuplicate({ title: res.data.title, id: res.data.id })
      } else {
        setRefDuplicate(null)
      }
    } catch {
      // Silently ignore check errors
    }
  }

  async function checkUrlDuplicate() {
    if (!form.tender_url.trim()) {
      setUrlDuplicate(null)
      return
    }
    try {
      const res = await api.get('/tenders/check-duplicate', { params: { url: form.tender_url } })
      if (res.data.exists && res.data.id !== tender?.id) {
        setUrlDuplicate({ title: res.data.title, id: res.data.id })
      } else {
        setUrlDuplicate(null)
      }
    } catch {
      // Silently ignore check errors
    }
  }

  async function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (extracting) return
    const pastedUrl = e.clipboardData.getData('text').trim()
    if (!pastedUrl.includes('find-tender.service.gov.uk')) return
    setExtracting(true)
    setExtractStatus('loading')
    try {
      const res = await api.post('/prospected/extract', { url: pastedUrl })
      if (res.data.success) {
        const { title, submission_deadline, ocds_id, value, buyer, sector } = res.data.data
        setForm(prev => ({
          ...prev,
          title: prev.title || title,
          submission_deadline: prev.submission_deadline || (submission_deadline ? submission_deadline + 'T00:00' : ''),
          reference_number: prev.reference_number || ocds_id || '',
          estimated_value: prev.estimated_value || (value != null ? String(value) : ''),
          buyer: prev.buyer || (buyer != null ? buyer : ''),
          sector: prev.sector || (sector != null ? sector : ''),
          portal: prev.portal || 'Find a Tender',
        }))
        setExtractStatus('success')
        setTimeout(() => setExtractStatus(null), 3000)
      } else {
        setExtractStatus('error')
        setTimeout(() => setExtractStatus(null), 3000)
      }
    } catch {
      setExtractStatus('error')
      setTimeout(() => setExtractStatus(null), 3000)
    } finally {
      setExtracting(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setTitleError(true)
      return
    }
    setSaving(true)
    const payload = {
      client_id: form.client_id ? parseInt(form.client_id) : null,
      title: form.title.trim(),
      buyer: form.buyer || null,
      estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      evia_fee: form.evia_fee ? parseFloat(form.evia_fee) : null,
      submission_deadline: form.submission_deadline || null,
      portal: form.portal || null,
      reference_number: form.reference_number || null,
      sector: form.sector || null,
      tender_url: form.tender_url || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
    }
    try {
      if (tender) {
        await api.put(`/tenders/${tender.id}`, payload)
        toast.success('Tender updated successfully')
      } else {
        await api.post('/tenders', payload)
        toast.success('Tender added successfully')
      }
      onSuccess()
    } catch {
      toast.error(
        tender
          ? 'Failed to update tender. Please try again.'
          : 'Failed to add tender. Please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  const statusOptions = tender ? EDIT_STATUSES : ADD_STATUSES
  const showResultsWarning = tender && (form.status === 'won' || form.status === 'lost')

  return (
    <form onSubmit={handleSave} noValidate>

      {/* Tender URL */}
      <div className="form-group">
        <label htmlFor="tf-url">Tender URL</label>
        <input
          id="tf-url"
          name="tender_url"
          type="text"
          value={form.tender_url}
          onChange={handleField}
          onBlur={checkUrlDuplicate}
          onPaste={!tender ? handleUrlPaste : undefined}
          placeholder="https://..."
        />
        {urlDuplicate && (
          <div className="duplicate-warning">
            A tender with this URL already exists: {urlDuplicate.title}
          </div>
        )}
        {!tender && extractStatus === 'loading' && (
          <span className="url-extract-status url-extract-loading">Fetching tender details...</span>
        )}
        {!tender && extractStatus === 'success' && (
          <span className="url-extract-status url-extract-success">Details auto-filled</span>
        )}
        {!tender && extractStatus === 'error' && (
          <span className="url-extract-status url-extract-error">Could not auto-fill, please enter details manually</span>
        )}
      </div>

      {/* Tender Title */}
      <div className="form-group">
        <label htmlFor="tf-title">Tender Title <span className="required">*</span></label>
        <input
          id="tf-title"
          name="title"
          type="text"
          value={form.title}
          onChange={handleField}
          className={titleError ? 'input-error' : ''}
        />
        {titleError && (
          <span className="field-error">Tender title is required</span>
        )}
      </div>

      {/* Buyer */}
      <div className="form-group">
        <label htmlFor="tf-buyer">Buyer / Contracting Authority</label>
        <input id="tf-buyer" name="buyer" type="text" value={form.buyer} onChange={handleField} />
      </div>

      {/* Estimated Value */}
      <div className="form-group">
        <label htmlFor="tf-value">Estimated Contract Value</label>
        <div className="value-input-group">
          <span className="value-input-prefix">£</span>
          <input
            id="tf-value"
            name="estimated_value"
            type="number"
            min="0"
            step="1"
            value={form.estimated_value}
            onChange={handleField}
            placeholder="0"
          />
        </div>
      </div>

      {/* Evia Fee */}
      <div className="form-group">
        <label htmlFor="tf-evia-fee">Evia Fee</label>
        <div className="value-input-group">
          <span className="value-input-prefix">£</span>
          <input
            id="tf-evia-fee"
            name="evia_fee"
            type="number"
            min="0"
            step="1"
            value={form.evia_fee}
            onChange={handleField}
            placeholder="2000"
          />
        </div>
        <span style={{ fontSize: '11px', color: '#9488b8' }}>Auto-calculated. Edit to override.</span>
      </div>

      {/* Submission Deadline */}
      <div className="form-group">
        <label htmlFor="tf-deadline">Submission Deadline</label>
        <input
          id="tf-deadline"
          name="submission_deadline"
          type="datetime-local"
          value={form.submission_deadline}
          onChange={handleField}
        />
      </div>

      {/* Portal */}
      <div className="form-group">
        <label htmlFor="tf-portal">Portal</label>
        <input
          id="tf-portal"
          name="portal"
          type="text"
          value={form.portal}
          onChange={handleField}
          placeholder="e.g. Contracts Finder, FTS, ProContract"
        />
      </div>

      {/* Reference Number */}
      <div className="form-group">
        <label htmlFor="tf-ref">Reference Number</label>
        <input
          id="tf-ref"
          name="reference_number"
          type="text"
          value={form.reference_number}
          onChange={handleField}
          onBlur={checkRefDuplicate}
        />
        {refDuplicate && (
          <div className="duplicate-warning">
            A tender with this reference already exists: {refDuplicate.title}
          </div>
        )}
      </div>

      {/* Sector */}
      <div className="form-group">
        <label htmlFor="tf-sector">Sector</label>
        <input
          id="tf-sector"
          name="sector"
          type="text"
          value={form.sector}
          onChange={handleField}
          placeholder="e.g. Cleaning, Electrical, Facilities Management"
        />
      </div>

      {/* Client */}
      <div className="form-group">
        <label htmlFor="tf-client">Client</label>
        <select id="tf-client" name="client_id" value={form.client_id} onChange={handleField}>
          <option value="">No client</option>
          {clients.map(c => (
            <option key={c.id} value={String(c.id)}>{c.company_name}</option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div className="form-group">
        <label htmlFor="tf-status">Status</label>
        <select id="tf-status" name="status" value={form.status} onChange={handleField}>
          {statusOptions.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {showResultsWarning && (
          <div className="status-change-warning">
            This will move the tender to the Results view.
          </div>
        )}
      </div>

      {/* Assigned To */}
      <div className="form-group">
        <label htmlFor="tf-assigned">Assigned To</label>
        <select id="tf-assigned" name="assigned_to" value={form.assigned_to} onChange={handleField}>
          <option value="Vlad">Vlad</option>
          <option value="Tristan">Tristan</option>
          <option value="Both">Both</option>
        </select>
      </div>

      {/* Notes */}
      <div className="form-group">
        <label htmlFor="tf-notes">Notes</label>
        <textarea id="tf-notes" name="notes" rows={3} value={form.notes} onChange={handleField} />
      </div>

      <div className="panel-form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Tender'}
        </button>
      </div>
    </form>
  )
}
