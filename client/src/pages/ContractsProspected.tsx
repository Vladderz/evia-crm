import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react'
import api from '../lib/api'
import type { ProspectedContract } from '../lib/types'
import StatsBar from '../components/StatsBar'
import SlidePanel from '../components/SlidePanel'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/ToastProvider'
import { useAuth } from '../context/AuthContext'

function formatDate(iso: string): string {
  const dateStr = iso.slice(0, 10)
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getCountdown(iso: string): { text: string; className: string } {
  const dateStr = iso.slice(0, 10)
  const [year, month, day] = dateStr.split('-').map(Number)
  const deadline = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = deadline.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: '(Overdue)', className: 'deadline-countdown-red' }
  if (diffDays === 0) return { text: '(Today)', className: 'deadline-countdown-red' }
  if (diffDays < 7) return { text: `(${diffDays} day${diffDays === 1 ? '' : 's'})`, className: 'deadline-countdown-red' }
  if (diffDays < 14) return { text: `(${diffDays} days)`, className: 'deadline-countdown-amber' }
  return { text: `(${diffDays} days)`, className: 'deadline-countdown-green' }
}

interface ProspectedStats {
  today: number
  this_week: number
  vlad_today: number
  vlad_week: number
  tristan_today: number
  tristan_week: number
}

interface FormState {
  title: string
  url: string
  submission_deadline: string
  source: 'fts' | 'manual'
  ocds_id: string | null
}

const EMPTY_FORM: FormState = {
  title: '',
  url: '',
  submission_deadline: '',
  source: 'manual',
  ocds_id: null,
}

export default function ContractsProspected() {
  const toast = useToast()
  const { user } = useAuth()

  const [contracts, setContracts] = useState<ProspectedContract[]>([])
  const [stats, setStats] = useState<ProspectedStats>({ today: 0, this_week: 0, vlad_today: 0, vlad_week: 0, tristan_today: 0, tristan_week: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [urlInput, setUrlInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Add Contract')
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [titleError, setTitleError] = useState(false)
  const [deadlineError, setDeadlineError] = useState(false)
  const [deadlineHint, setDeadlineHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<ProspectedContract | null>(null)
  const [pipelineIds, setPipelineIds] = useState<Set<number>>(new Set())

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [contractsRes, statsRes] = await Promise.all([
        api.get('/prospected'),
        api.get('/prospected/stats'),
      ])
      setContracts(contractsRes.data)
      setStats(statsRes.data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch pipeline entries to determine which contracts are already in the pipeline
  useEffect(() => {
    api.get('/pipeline').then(res => {
      const ids = new Set<number>(
        (res.data as Array<{ prospected_contract_id: number | null }>)
          .filter(p => p.prospected_contract_id != null)
          .map(p => p.prospected_contract_id as number)
      )
      setPipelineIds(ids)
    }).catch(() => {
      // Silently ignore - button will just show as available
    })
  }, [])

  // Client-side search filter
  const visible = debouncedSearch
    ? contracts.filter(c => c.title.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : contracts

  function openPanel(prefill: Partial<FormState>, title: string, hint: string | null = null) {
    setForm({ ...EMPTY_FORM, ...prefill })
    setPanelTitle(title)
    setTitleError(false)
    setDeadlineError(false)
    setDeadlineHint(hint)
    setPanelOpen(true)
  }

  async function handleAdd() {
    setDuplicateError(null)
    const trimmed = urlInput.trim()

    if (!trimmed) {
      openPanel({}, 'Add Contract')
      return
    }

    const isFts = trimmed.toLowerCase().includes('find-tender.service.gov.uk')

    if (!isFts) {
      openPanel({ url: trimmed }, 'Add Contract')
      return
    }

    // FTS URL - open the panel immediately so the user sees feedback,
    // then run the extract in the background. When it resolves we patch
    // in the title/deadline if the user hasn't already typed something
    // there. The url field is the identity check - if the panel was
    // closed and reopened with a different URL before extract resolved,
    // we drop the stale result.
    openPanel({ url: trimmed, source: 'fts' }, 'Add Contract (FTS)')
    setExtracting(true)
    try {
      const res = await api.post('/prospected/extract', { url: trimmed })
      if (res.data.success && res.data.data?.title) {
        const { title, submission_deadline, ocds_id, notice_tag } = res.data.data
        setForm(prev => {
          if (prev.url !== trimmed) return prev
          return {
            ...prev,
            title: prev.title || title,
            submission_deadline: prev.submission_deadline || (submission_deadline ?? ''),
            ocds_id: prev.ocds_id || ocds_id,
            source: 'fts',
          }
        })
        if (!submission_deadline) {
          setDeadlineHint(
            notice_tag === 'planning'
              ? 'Pipeline notice — no deadline published. Enter manually if known.'
              : 'No deadline published for this notice. Enter manually if known.'
          )
        }
      } else {
        toast.error(res.data.message || 'Could not extract details from this URL. Please enter the details manually.')
      }
    } catch {
      toast.error('Could not extract details from this URL. Please enter the details manually.')
    } finally {
      setExtracting(false)
    }
  }

  function handleField(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'title') setTitleError(false)
    if (name === 'submission_deadline') {
      setDeadlineError(false)
      setDeadlineHint(null)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    let hasError = false
    if (!form.title.trim()) { setTitleError(true); hasError = true }
    if (!form.submission_deadline) { setDeadlineError(true); hasError = true }
    if (hasError) return

    setSaving(true)
    try {
      const res = await api.post<ProspectedContract>('/prospected', {
        title: form.title.trim(),
        url: form.url.trim() || null,
        submission_deadline: form.submission_deadline,
        source: form.source,
        ocds_id: form.ocds_id,
      })
      const created: ProspectedContract = {
        ...res.data,
        added_by_name: user?.name ?? '',
      }
      setContracts(prev => [created, ...prev])
      setStats(prev => {
        const next = { ...prev, today: prev.today + 1, this_week: prev.this_week + 1 }
        if (user?.email === 'vlad@eviamarketing.co.uk') {
          next.vlad_today = prev.vlad_today + 1
          next.vlad_week = prev.vlad_week + 1
        } else if (user?.email === 'tristan@eviamarketing.co.uk') {
          next.tristan_today = prev.tristan_today + 1
          next.tristan_week = prev.tristan_week + 1
        }
        return next
      })
      toast.success('Contract added')
      setUrlInput('')
      setDuplicateError(null)
      setPanelOpen(false)
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { error?: string; existing?: { added_by_name?: string; created_at?: string; stage?: string } } } })?.response
      const status = response?.status
      if (status === 409) {
        const ex = response?.data?.existing
        const who = ex?.added_by_name || 'another user'
        const when = ex?.created_at ? formatDate(ex.created_at) : null
        const stage = ex?.stage || 'Contracts Prospected'
        const msg = when
          ? `Already added by ${who} on ${when} (${stage}).`
          : `Already added by ${who} (${stage}).`
        setDuplicateError(msg)
        setPanelOpen(false)
      } else {
        toast.error('Failed to add contract. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAddToPipeline(contract: ProspectedContract) {
    try {
      await api.post(`/pipeline/from-prospected/${contract.id}`)
      toast.success('Added to Sales Pipeline')
      setPipelineIds(prev => new Set([...prev, contract.id]))
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (status === 409) {
        toast.error(message || 'Already in Sales Pipeline')
        setPipelineIds(prev => new Set([...prev, contract.id]))
      } else {
        toast.error('Failed to add to pipeline. Please try again.')
      }
    }
  }

  async function handlePromote(contract: ProspectedContract) {
    try {
      await api.post(`/prospected/${contract.id}/promote`)
      toast.success('Contract promoted to Active Tenders')
      fetchData()
    } catch {
      toast.error('Failed to promote contract. Please try again.')
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await api.delete(`/prospected/${deleteTarget.id}`)
      toast.success('Contract deleted')
      setDeleteTarget(null)
      fetchData()
    } catch {
      toast.error('Failed to delete contract. Please try again.')
      setDeleteTarget(null)
    }
  }

  const statItems = [
    { label: 'Today', value: stats.today },
    { label: 'This Week', value: stats.this_week },
    { label: 'Vlad', value: `${stats.vlad_today} / 10 (${stats.vlad_week} this week)` },
    { label: 'Tristan', value: `${stats.tristan_today} / 10 (${stats.tristan_week} this week)` },
  ]

  if (loading) {
    return <LoadingSpinner message="Loading contracts..." />
  }

  if (loadError) {
    return (
      <div className="page-error">
        <p>Something went wrong loading contracts. Please try again.</p>
        <button className="btn btn-primary" onClick={fetchData}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-prospected">
      <StatsBar stats={statItems} className="stats-bar-4" />

      {/* URL input bar */}
      <div className="url-input-bar">
        <input
          type="text"
          className="url-input"
          placeholder="Paste a Find a Tender URL or add manually..."
          value={urlInput}
          onChange={e => { setUrlInput(e.target.value); setDuplicateError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={extracting}
          type="button"
        >
          {extracting ? 'Loading...' : 'Add'}
        </button>
      </div>
      {duplicateError && (
        <div className="duplicate-error-banner" role="alert">
          {duplicateError}
        </div>
      )}

      {/* Search bar */}
      <div className="toolbar" style={{ marginBottom: '24px' }}>
        <input
          type="search"
          className="toolbar-search"
          placeholder="Search contracts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="empty-state">
          {contracts.length === 0 ? (
            <p>No contracts prospected yet. Paste a Find a Tender URL above to get started.</p>
          ) : (
            <p>No contracts match your search.</p>
          )}
        </div>
      ) : (
        <div className="prospected-table-wrapper">
          <table className="prospected-table">
            <thead>
              <tr>
                <th>Contract Name</th>
                <th>Source</th>
                <th>Date Added</th>
                <th>Deadline</th>
                <th>Added By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(contract => {
                const countdown = getCountdown(contract.submission_deadline)
                return (
                  <tr key={contract.id}>
                    <td className="td-contract-name">
                      <a
                        href={contract.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="prospected-link"
                      >
                        {contract.title}
                      </a>
                    </td>
                    <td>
                      <span className={contract.source === 'fts' ? 'source-badge-fts' : 'source-badge-manual'}>
                        {contract.source === 'fts' ? 'FTS' : 'Manual'}
                      </span>
                    </td>
                    <td>{formatDate(contract.created_at)}</td>
                    <td>
                      {formatDate(contract.submission_deadline)}{' '}
                      <span className={countdown.className}>{countdown.text}</span>
                    </td>
                    <td>{contract.added_by_name}</td>
                    <td>
                      <button
                        className={pipelineIds.has(contract.id) ? 'btn-pipeline-added' : 'btn-add-pipeline'}
                        onClick={() => { if (!pipelineIds.has(contract.id)) handleAddToPipeline(contract) }}
                        disabled={pipelineIds.has(contract.id)}
                        type="button"
                      >
                        {pipelineIds.has(contract.id) ? 'In Pipeline' : 'Add to Pipeline'}
                      </button>
                      <button
                        className="btn-promote"
                        onClick={() => handlePromote(contract)}
                        type="button"
                      >
                        Promote
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => setDeleteTarget(contract)}
                        type="button"
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

      {/* Add panel */}
      <SlidePanel open={panelOpen} onClose={() => { if (!saving) setPanelOpen(false) }} title={panelTitle}>
        <form onSubmit={handleSave} noValidate>

          {extracting && (
            <div className="extract-loading-banner url-extract-loading" role="status">
              Extracting from Find a Tender…
            </div>
          )}

          <div className="form-group">
            <label htmlFor="pc-title">Contract Name <span className="required">*</span></label>
            <input
              id="pc-title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleField}
              className={titleError ? 'input-error' : ''}
            />
            {titleError && <span className="field-error">Contract name is required</span>}
          </div>

          <div className="form-group">
            <label htmlFor="pc-url">URL</label>
            <input
              id="pc-url"
              name="url"
              type="text"
              value={form.url}
              onChange={handleField}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="pc-deadline">Submission Deadline <span className="required">*</span></label>
            <input
              id="pc-deadline"
              name="submission_deadline"
              type="date"
              value={form.submission_deadline}
              onChange={handleField}
              className={deadlineError ? 'input-error' : ''}
            />
            {deadlineError && <span className="field-error">Submission deadline is required</span>}
            {!deadlineError && deadlineHint && <span className="field-hint">{deadlineHint}</span>}
          </div>

          <div className="panel-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPanelOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Contract'}
            </button>
          </div>
        </form>
      </SlidePanel>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Contract"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
