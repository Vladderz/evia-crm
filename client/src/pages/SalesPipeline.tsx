import { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react'
import api from '../lib/api'
import type { PipelineProspect } from '../lib/types'
import StatsBar from '../components/StatsBar'
import SlidePanel from '../components/SlidePanel'
import NotesPanel from '../components/NotesPanel'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/ToastProvider'
import { formatDate, getDeadlineCountdown, calculateEviaFee } from '../lib/tenderUtils'

const STATUS_LABELS: Record<string, string> = {
  contacted: 'Contacted',
  call_booked: 'Call Booked',
  call_done: 'Call Done',
  contract_sent: 'Contract Sent',
  agreed: 'Agreed',
  not_interested: 'Not Interested',
}

const ADVANCE_LABELS: Record<string, string> = {
  contacted: 'Book Call',
  call_booked: 'Call Done',
  call_done: 'Send Contract',
  contract_sent: 'Agreed',
}

interface PipelineStats {
  total: number
  contacted: number
  in_discussion: number
  contract_sent: number
  overdue_followups: number
}

interface FormState {
  company_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  sector: string
  region: string
  tender_url: string
  tender_title: string
  tender_reference: string
  tender_value: string
  submission_deadline: string
  award_date: string
  buyer: string
  status: string
  assigned_to: string
  last_contact_date: string
  next_followup_date: string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function emptyForm(): FormState {
  return {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    website: '',
    sector: '',
    region: '',
    tender_url: '',
    tender_title: '',
    tender_reference: '',
    tender_value: '',
    submission_deadline: '',
    award_date: '',
    buyer: '',
    status: 'contacted',
    assigned_to: '',
    last_contact_date: todayStr(),
    next_followup_date: daysFromNow(3),
  }
}

export default function SalesPipeline() {
  const toast = useToast()

  const [prospects, setProspects] = useState<PipelineProspect[]>([])
  const [stats, setStats] = useState<PipelineStats>({
    total: 0, contacted: 0, in_discussion: 0, contract_sent: 0, overdue_followups: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Search and filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')

  // Add/edit panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingProspect, setEditingProspect] = useState<PipelineProspect | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [companyError, setCompanyError] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractStatus, setExtractStatus] = useState<'loading' | 'success' | 'error' | null>(null)

  // Notes panel
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesProspect, setNotesProspect] = useState<PipelineProspect | null>(null)

  // Confirm dialogs
  const [dropTarget, setDropTarget] = useState<PipelineProspect | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PipelineProspect | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/pipeline/stats')
      setStats(res.data)
    } catch {
      // silently ignore stats errors
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [prospectsRes, statsRes] = await Promise.all([
        api.get('/pipeline'),
        api.get('/pipeline/stats'),
      ])
      setProspects(prospectsRes.data)
      setStats(statsRes.data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered prospects
  const visible = prospects.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (assignedFilter && p.assigned_to !== assignedFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      return (
        p.company_name.toLowerCase().includes(q) ||
        (p.tender_title ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  function openAdd() {
    setNotesOpen(false)
    setEditingProspect(null)
    setForm(emptyForm())
    setCompanyError(false)
    setExtractStatus(null)
    setPanelOpen(true)
  }

  function openEdit(prospect: PipelineProspect) {
    setNotesOpen(false)
    setEditingProspect(prospect)
    setForm({
      company_name: prospect.company_name,
      contact_name: prospect.contact_name ?? '',
      email: prospect.email ?? '',
      phone: prospect.phone ?? '',
      website: prospect.website ?? '',
      sector: prospect.sector ?? '',
      region: prospect.region ?? '',
      tender_url: prospect.tender_url ?? '',
      tender_title: prospect.tender_title ?? '',
      tender_reference: prospect.tender_reference ?? '',
      tender_value: prospect.tender_value != null ? String(prospect.tender_value) : '',
      submission_deadline: prospect.submission_deadline ? prospect.submission_deadline.slice(0, 10) : '',
      award_date: prospect.award_date ? prospect.award_date.slice(0, 10) : '',
      buyer: prospect.buyer ?? '',
      status: prospect.status,
      assigned_to: prospect.assigned_to ?? '',
      last_contact_date: prospect.last_contact_date ? prospect.last_contact_date.slice(0, 10) : '',
      next_followup_date: prospect.next_followup_date ? prospect.next_followup_date.slice(0, 10) : '',
    })
    setCompanyError(false)
    setExtractStatus(null)
    setPanelOpen(true)
  }

  function openNotes(prospect: PipelineProspect) {
    setPanelOpen(false)
    setNotesProspect(prospect)
    setNotesOpen(true)
  }

  function handleField(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'company_name') setCompanyError(false)
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
        const { title, submission_deadline, ocds_id, value, buyer, award_date } = res.data.data
        setForm(prev => ({
          ...prev,
          tender_title: prev.tender_title || title || '',
          tender_reference: prev.tender_reference || ocds_id || '',
          submission_deadline: prev.submission_deadline || (submission_deadline ? submission_deadline : ''),
          tender_value: prev.tender_value || (value != null ? String(value) : ''),
          buyer: prev.buyer || (buyer != null ? buyer : ''),
          award_date: prev.award_date || (award_date ? award_date : ''),
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
    if (!form.company_name.trim()) {
      setCompanyError(true)
      return
    }
    setSaving(true)
    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      sector: form.sector || null,
      region: form.region || null,
      tender_url: form.tender_url || null,
      tender_title: form.tender_title || null,
      tender_reference: form.tender_reference || null,
      tender_value: form.tender_value ? parseFloat(form.tender_value) : null,
      submission_deadline: form.submission_deadline || null,
      award_date: form.award_date || null,
      buyer: form.buyer || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
      last_contact_date: form.last_contact_date || null,
      next_followup_date: form.next_followup_date || null,
    }
    try {
      if (editingProspect) {
        const res = await api.put(`/pipeline/${editingProspect.id}`, payload)
        setProspects(prev => prev.map(p => p.id === editingProspect.id ? res.data : p))
        toast.success('Prospect updated')
      } else {
        const res = await api.post('/pipeline', payload)
        setProspects(prev => [res.data, ...prev])
        toast.success('Prospect added')
      }
      fetchStats()
      setPanelOpen(false)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (status === 409) {
        toast.error(message || 'This tender is already in the pipeline')
      } else if (status === 400) {
        toast.error(message || 'Please check the form and try again')
      } else {
        toast.error(editingProspect ? 'Failed to update prospect' : 'Failed to add prospect')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAdvance(prospect: PipelineProspect) {
    try {
      const res = await api.post(`/pipeline/${prospect.id}/advance`)
      const updated: PipelineProspect = res.data

      if (updated.status === 'agreed') {
        // Auto-promote to Client Book and Active Tenders
        try {
          await api.post(`/pipeline/${prospect.id}/promote`)
          setProspects(prev => prev.filter(p => p.id !== prospect.id))
          fetchStats()
          toast.success(`${prospect.company_name} promoted to Client Book and Active Tenders`)
        } catch {
          // Promote failed - keep the row at 'agreed' so user can retry
          setProspects(prev => prev.map(p => p.id === prospect.id ? updated : p))
          fetchStats()
          toast.error('Prospect marked as Agreed but promote failed. Please try again.')
        }
      } else {
        setProspects(prev => prev.map(p => p.id === prospect.id ? updated : p))
        fetchStats()
        toast.success(`Status updated to ${STATUS_LABELS[updated.status] ?? updated.status}`)
      }
    } catch {
      toast.error('Failed to advance status')
    }
  }

  async function handleDropConfirm() {
    if (!dropTarget) return
    const prospect = dropTarget
    setDropTarget(null)
    try {
      await api.post(`/pipeline/${prospect.id}/not-interested`)
      setProspects(prev => prev.filter(p => p.id !== prospect.id))
      fetchStats()
      toast.success(`${prospect.company_name} removed from pipeline`)
    } catch {
      toast.error('Failed to mark as not interested')
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const prospect = deleteTarget
    setDeleteTarget(null)
    try {
      await api.delete(`/pipeline/${prospect.id}`)
      setProspects(prev => prev.filter(p => p.id !== prospect.id))
      fetchStats()
      toast.success(`${prospect.company_name} deleted`)
    } catch {
      toast.error('Failed to delete prospect')
    }
  }

  const tenderValueNum = form.tender_value ? parseFloat(form.tender_value) : null
  const eviaFeePreview = tenderValueNum && !isNaN(tenderValueNum) && tenderValueNum > 0
    ? calculateEviaFee(tenderValueNum)
    : null

  const statItems = [
    { label: 'Active Prospects', value: stats.total },
    { label: 'Contacted', value: stats.contacted },
    { label: 'In Discussion', value: stats.in_discussion },
    { label: 'Contract Sent', value: stats.contract_sent },
    {
      label: 'Overdue Follow-ups',
      value: stats.overdue_followups,
      valueClassName: stats.overdue_followups > 0 ? 'stat-value-alert' : '',
    },
  ]

  if (loading) {
    return <LoadingSpinner message="Loading pipeline..." />
  }

  if (loadError) {
    return (
      <div className="page-error">
        <p>Something went wrong loading the pipeline. Please try again.</p>
        <button className="btn btn-primary" onClick={fetchData}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-pipeline">
      <StatsBar stats={statItems} className="stats-bar-5" />

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="toolbar-search"
            placeholder="Search by company or tender..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="toolbar-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="contacted">Contacted</option>
            <option value="call_booked">Call Booked</option>
            <option value="call_done">Call Done</option>
            <option value="contract_sent">Contract Sent</option>
          </select>
          <select
            className="toolbar-select"
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="Vlad">Vlad</option>
            <option value="Tristan">Tristan</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Prospect</button>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="empty-state">
          {prospects.length === 0 ? (
            <p>No prospects in the pipeline yet. Add a prospect to get started.</p>
          ) : (
            <p>No prospects match your search or filter.</p>
          )}
        </div>
      ) : (
        <div className="pipeline-table-wrapper">
          <table className="pipeline-table">
            <thead>
              <tr>
                <th>COMPANY</th>
                <th>TENDER</th>
                <th>STATUS</th>
                <th>LAST CONTACT</th>
                <th>NEXT FOLLOW-UP</th>
                <th>ASSIGNED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(prospect => {
                const followupCountdown = getDeadlineCountdown(prospect.next_followup_date)
                const isTBC = prospect.company_name === 'TBC'
                return (
                  <tr key={prospect.id}>
                    <td className="td-pipeline-company">
                      {isTBC ? (
                        <span className="company-tbc">{prospect.company_name}</span>
                      ) : prospect.website ? (
                        <a
                          href={prospect.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pipeline-link"
                        >
                          {prospect.company_name}
                        </a>
                      ) : (
                        prospect.company_name
                      )}
                      {prospect.contact_name && (
                        <div className="pipeline-sub-text">{prospect.contact_name}</div>
                      )}
                    </td>
                    <td className="td-pipeline-tender">
                      {prospect.tender_url ? (
                        <a
                          href={prospect.tender_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pipeline-link"
                        >
                          {prospect.tender_title || '(no title)'}
                        </a>
                      ) : (
                        prospect.tender_title || '-'
                      )}
                      {prospect.buyer && (
                        <div className="pipeline-sub-text">{prospect.buyer}</div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge status-${prospect.status.replace(/_/g, '-')}`}>
                        {STATUS_LABELS[prospect.status] ?? prospect.status}
                      </span>
                    </td>
                    <td>{prospect.last_contact_date ? formatDate(prospect.last_contact_date) : '-'}</td>
                    <td>
                      {prospect.next_followup_date ? (
                        <>
                          {formatDate(prospect.next_followup_date)}{' '}
                          {followupCountdown.colorClass && (
                            <span className={followupCountdown.colorClass}>
                              ({followupCountdown.text})
                            </span>
                          )}
                        </>
                      ) : '-'}
                    </td>
                    <td>{prospect.assigned_to ?? ''}</td>
                    <td className="td-pipeline-actions">
                      {ADVANCE_LABELS[prospect.status] && (
                        <button
                          className="btn-pipeline-advance"
                          type="button"
                          onClick={() => handleAdvance(prospect)}
                        >
                          {ADVANCE_LABELS[prospect.status]}
                        </button>
                      )}
                      <button
                        className="btn-pipeline-notes"
                        type="button"
                        onClick={() => openNotes(prospect)}
                      >
                        Notes
                      </button>
                      <button
                        className="btn-pipeline-edit"
                        type="button"
                        onClick={() => openEdit(prospect)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-pipeline-drop"
                        type="button"
                        onClick={() => setDropTarget(prospect)}
                      >
                        Drop
                      </button>
                      <button
                        className="btn-pipeline-delete"
                        type="button"
                        onClick={() => setDeleteTarget(prospect)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes panel */}
      <NotesPanel
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
        title={notesProspect ? `${notesProspect.company_name} - Notes` : 'Notes'}
        entityType="pipeline"
        entityId={notesProspect?.id ?? null}
      />

      {/* Add/Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => { if (!saving) setPanelOpen(false) }}
        title={editingProspect ? 'Edit Prospect' : 'Add Prospect'}
      >
        <form onSubmit={handleSave} noValidate>
          <div className="form-section-heading">PROSPECT DETAILS</div>

          <div className="form-group">
            <label>Company Name <span className="required">*</span></label>
            <input
              name="company_name"
              type="text"
              value={form.company_name}
              onChange={handleField}
              className={companyError ? 'input-error' : ''}
            />
            {companyError && <span className="field-error">Company name is required</span>}
          </div>

          <div className="form-group">
            <label>Contact Name</label>
            <input name="contact_name" type="text" value={form.contact_name} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input name="email" type="text" value={form.email} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input name="phone" type="text" value={form.phone} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Website</label>
            <input name="website" type="text" value={form.website} onChange={handleField} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label>Sector</label>
            <input name="sector" type="text" value={form.sector} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Region</label>
            <input name="region" type="text" value={form.region} onChange={handleField} />
          </div>

          <div className="form-section-heading">TENDER DETAILS</div>

          <div className="form-group">
            <label>Tender URL</label>
            <input
              name="tender_url"
              type="text"
              value={form.tender_url}
              onChange={handleField}
              onPaste={handleUrlPaste}
              placeholder="https://..."
            />
            {extractStatus === 'loading' && (
              <span className="url-extract-status url-extract-loading">Fetching tender details...</span>
            )}
            {extractStatus === 'success' && (
              <span className="url-extract-status url-extract-success">Details auto-filled</span>
            )}
            {extractStatus === 'error' && (
              <span className="url-extract-status url-extract-error">
                Could not auto-fill, please enter details manually
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Tender Title</label>
            <input name="tender_title" type="text" value={form.tender_title} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Tender Reference</label>
            <input name="tender_reference" type="text" value={form.tender_reference} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Tender Value</label>
            <div className="value-input-group">
              <span className="value-input-prefix">£</span>
              <input
                name="tender_value"
                type="number"
                min="0"
                step="1"
                value={form.tender_value}
                onChange={handleField}
                placeholder="0"
              />
            </div>
            {eviaFeePreview && (
              <span style={{ fontSize: '11px', color: '#9488b8' }}>Evia fee: {eviaFeePreview}</span>
            )}
          </div>

          <div className="form-group">
            <label>Submission Deadline</label>
            <input name="submission_deadline" type="date" value={form.submission_deadline} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Award Date</label>
            <input name="award_date" type="date" value={form.award_date} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Buyer</label>
            <input name="buyer" type="text" value={form.buyer} onChange={handleField} />
          </div>

          <div className="form-section-heading">PIPELINE</div>

          <div className="form-group">
            <label>Status</label>
            <select name="status" value={form.status} onChange={handleField}>
              <option value="contacted">Contacted</option>
              <option value="call_booked">Call Booked</option>
              <option value="call_done">Call Done</option>
              <option value="contract_sent">Contract Sent</option>
            </select>
          </div>

          <div className="form-group">
            <label>Assigned To</label>
            <select name="assigned_to" value={form.assigned_to} onChange={handleField}>
              <option value="">-- Select --</option>
              <option value="Vlad">Vlad</option>
              <option value="Tristan">Tristan</option>
            </select>
          </div>

          <div className="form-group">
            <label>Last Contact Date</label>
            <input name="last_contact_date" type="date" value={form.last_contact_date} onChange={handleField} />
          </div>

          <div className="form-group">
            <label>Next Follow-up Date</label>
            <input name="next_followup_date" type="date" value={form.next_followup_date} onChange={handleField} />
          </div>

          <div className="panel-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPanelOpen(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Prospect'}
            </button>
          </div>
        </form>
      </SlidePanel>

      {/* Drop confirmation */}
      <ConfirmDialog
        open={dropTarget !== null}
        title="Mark as Not Interested"
        message={
          dropTarget
            ? `Mark ${dropTarget.company_name} as not interested? This will remove them from the pipeline.`
            : ''
        }
        confirmLabel="Mark Not Interested"
        onConfirm={handleDropConfirm}
        onCancel={() => setDropTarget(null)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Prospect"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.company_name} from the pipeline? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
