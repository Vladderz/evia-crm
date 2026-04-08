import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import api from '../lib/api'
import { useToast } from '../components/ToastProvider'
import StatsBar from '../components/StatsBar'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'

type Outcome = 'Won' | 'Lost' | 'Awaiting'

interface TenderResult {
  id: number
  tender_name: string
  client_name: string | null
  contracting_authority: string | null
  estimated_budget: string | number | null
  our_price: string | number | null
  bids_received: number | null
  winning_price: string | number | null
  quality_price_weighting: string | null
  outcome: Outcome
  position: number | null
  submitted_date: string | null
  notes: string | null
  tender_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface FormState {
  tender_name: string
  client_name: string
  contracting_authority: string
  estimated_budget: string
  our_price: string
  bids_received: string
  winning_price: string
  quality_price_weighting: string
  outcome: Outcome
  position: string
  submitted_date: string
  notes: string
  tender_url: string
}

const EMPTY_FORM: FormState = {
  tender_name: '',
  client_name: '',
  contracting_authority: '',
  estimated_budget: '',
  our_price: '',
  bids_received: '',
  winning_price: '',
  quality_price_weighting: '',
  outcome: 'Awaiting',
  position: '',
  submitted_date: '',
  notes: '',
  tender_url: '',
}

const WEIGHTING_OPTIONS = ['100/0', '90/10', '80/20', '70/30', '60/40', '50/50']

function toNum(v: string | number | null): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function fmtGBP(v: string | number | null): string {
  const n = toNum(v)
  if (n === null) return '--'
  return '£' + Math.round(n).toLocaleString('en-GB')
}

function fmtInt(v: number | null): string {
  if (v === null || v === undefined) return '--'
  return String(v)
}

function fmtWeighting(v: string | null): string {
  if (!v) return '--'
  return v
}

function calcDiscount(estimate: string | number | null, winning: string | number | null): number | null {
  const e = toNum(estimate)
  const w = toNum(winning)
  if (e === null || w === null || e === 0) return null
  return ((e - w) / e) * 100
}

export default function ResultsTracker() {
  const toast = useToast()

  const [results, setResults] = useState<TenderResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<TenderResult | null>(null)

  const fetchResults = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await api.get('/tender-results')
      setResults(res.data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchResults() }, [fetchResults])

  // Stats
  const totalTracked = results.length
  const decided = results.filter(r => r.outcome !== 'Awaiting')
  const wonCount = decided.filter(r => r.outcome === 'Won').length
  const winRate = decided.length > 0 ? Math.round((wonCount / decided.length) * 100) + '%' : '--'

  const discountsAll = results
    .map(r => calcDiscount(r.estimated_budget, r.winning_price))
    .filter((d): d is number => d !== null)
  const avgDiscount = discountsAll.length > 0
    ? (discountsAll.reduce((a, b) => a + b, 0) / discountsAll.length)
    : null
  const avgDiscountDisplay = avgDiscount === null
    ? '--'
    : (avgDiscount >= 0 ? '+' : '') + Math.round(avgDiscount) + '%'

  const qualityWeightedCount = results.filter(
    r => r.quality_price_weighting && r.quality_price_weighting !== '100/0'
  ).length

  const statItems = [
    { label: 'Total tracked', value: totalTracked },
    { label: 'Win rate', value: winRate },
    { label: 'Avg winning discount to estimate', value: avgDiscountDisplay },
    { label: 'Quality-weighted tenders', value: qualityWeightedCount },
  ]

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: TenderResult) {
    setEditingId(r.id)
    setForm({
      tender_name: r.tender_name ?? '',
      client_name: r.client_name ?? '',
      contracting_authority: r.contracting_authority ?? '',
      estimated_budget: r.estimated_budget != null ? String(r.estimated_budget) : '',
      our_price: r.our_price != null ? String(r.our_price) : '',
      bids_received: r.bids_received != null ? String(r.bids_received) : '',
      winning_price: r.winning_price != null ? String(r.winning_price) : '',
      quality_price_weighting: r.quality_price_weighting ?? '',
      outcome: r.outcome ?? 'Awaiting',
      position: r.position != null ? String(r.position) : '',
      submitted_date: r.submitted_date ? r.submitted_date.slice(0, 10) : '',
      notes: r.notes ?? '',
      tender_url: r.tender_url ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  function toggleExpand(id: number) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.tender_name.trim()) {
      setFormError('Tender name is required.')
      return
    }
    setFormError(null)
    setSaving(true)
    const payload = {
      tender_name: form.tender_name.trim(),
      client_name: form.client_name.trim() || null,
      contracting_authority: form.contracting_authority.trim() || null,
      estimated_budget: form.estimated_budget === '' ? null : form.estimated_budget,
      our_price: form.our_price === '' ? null : form.our_price,
      bids_received: form.bids_received === '' ? null : parseInt(form.bids_received, 10),
      winning_price: form.winning_price === '' ? null : form.winning_price,
      quality_price_weighting: form.quality_price_weighting || null,
      outcome: form.outcome,
      position: form.position === '' ? null : parseInt(form.position, 10),
      submitted_date: form.submitted_date || null,
      notes: form.notes.trim() || null,
      tender_url: form.tender_url.trim() || null,
    }
    try {
      if (editingId) {
        await api.put(`/tender-results/${editingId}`, payload)
        toast.success('Result updated')
      } else {
        await api.post('/tender-results', payload)
        toast.success('Result added')
      }
      setModalOpen(false)
      await fetchResults()
    } catch {
      toast.error('Something went wrong - please try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await api.delete(`/tender-results/${deleteTarget.id}`)
      toast.success('Result deleted')
      setDeleteTarget(null)
      await fetchResults()
    } catch {
      toast.error('Something went wrong - please try again')
      setDeleteTarget(null)
    }
  }

  if (loading) return <LoadingSpinner message="Loading results..." />

  if (loadError) {
    return (
      <div className="page-error">
        <p>Something went wrong loading results. Please try again.</p>
        <button className="btn btn-primary" onClick={fetchResults}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-results">
      <StatsBar stats={statItems} className="stats-bar-4" />

      <div className="toolbar">
        <div className="toolbar-filters" />
        <button className="btn btn-primary" onClick={openAdd}>+ Add result</button>
      </div>

      {results.length === 0 ? (
        <div className="empty-state">
          <p>No results tracked yet. Add your first result to start building your benchmarking data.</p>
        </div>
      ) : (
        <div className="tenders-table-wrapper">
          <table className="tenders-table results-table">
            <thead>
              <tr>
                <th className="td-chevron"></th>
                <th>Tender</th>
                <th>Est. budget</th>
                <th>Our price</th>
                <th>Bids</th>
                <th>Winning price</th>
                <th>Discount to est.</th>
                <th>Weighting</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const discount = calcDiscount(r.estimated_budget, r.winning_price)
                const expanded = expandedId === r.id
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="result-row"
                      onClick={() => toggleExpand(r.id)}
                    >
                      <td className="td-chevron">
                        <span className={`notes-toggle-chevron${expanded ? ' expanded' : ''}`}>&#9656;</span>
                      </td>
                      <td className="td-tender-title">
                        <div style={{ fontWeight: 600 }}>
                          {r.tender_url ? (
                            <a
                              href={r.tender_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {r.tender_name}
                            </a>
                          ) : (
                            r.tender_name
                          )}
                        </div>
                        {r.client_name && (
                          <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                            {r.client_name}
                          </div>
                        )}
                      </td>
                      <td>{fmtGBP(r.estimated_budget)}</td>
                      <td>{fmtGBP(r.our_price)}</td>
                      <td>{fmtInt(r.bids_received)}</td>
                      <td>{fmtGBP(r.winning_price)}</td>
                      <td>
                        {discount === null ? (
                          '--'
                        ) : (
                          <span className={discount < 0 ? 'discount-negative' : 'discount-positive'}>
                            {discount >= 0 ? '+' : ''}{discount.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td>{fmtWeighting(r.quality_price_weighting)}</td>
                      <td>
                        <span className={`status-badge badge-${r.outcome.toLowerCase()}`}>
                          {r.outcome}
                        </span>
                      </td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="btn-edit"
                          type="button"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="expanded-notes-row">
                        <td colSpan={10}>
                          {r.notes && r.notes.trim() ? (
                            r.notes
                          ) : (
                            <span className="expanded-notes-placeholder">
                              No notes added yet - click Edit to add quality feedback, scoring breakdowns, or lessons learned.
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-form-title">
          <div className="dialog dialog-form">
            <h3 id="result-form-title" className="dialog-title">
              {editingId ? 'Edit result' : 'Add result'}
            </h3>
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-error">{formError}</div>}
              <div className="form-grid">
                <div className="form-group form-full">
                  <label>Tender name <span className="required">*</span></label>
                  <input
                    type="text"
                    value={form.tender_name}
                    onChange={e => update('tender_name', e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group form-full">
                  <label>Tender URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.tender_url}
                    onChange={e => update('tender_url', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Client name</label>
                  <input
                    type="text"
                    value={form.client_name}
                    onChange={e => update('client_name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Contracting authority</label>
                  <input
                    type="text"
                    value={form.contracting_authority}
                    onChange={e => update('contracting_authority', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Estimated budget (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.estimated_budget}
                    onChange={e => update('estimated_budget', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Our price (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.our_price}
                    onChange={e => update('our_price', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Bids received</label>
                  <input
                    type="number"
                    value={form.bids_received}
                    onChange={e => update('bids_received', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Winning price (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.winning_price}
                    onChange={e => update('winning_price', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Quality / price weighting</label>
                  <select
                    value={form.quality_price_weighting}
                    onChange={e => update('quality_price_weighting', e.target.value)}
                  >
                    <option value="">--</option>
                    {WEIGHTING_OPTIONS.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Outcome</label>
                  <select
                    value={form.outcome}
                    onChange={e => update('outcome', e.target.value as Outcome)}
                  >
                    <option value="Awaiting">Awaiting</option>
                    <option value="Won">Won</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Position</label>
                  <input
                    type="number"
                    value={form.position}
                    onChange={e => update('position', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Submitted date</label>
                  <input
                    type="date"
                    value={form.submitted_date}
                    onChange={e => update('submitted_date', e.target.value)}
                  />
                </div>
                <div className="form-group form-full">
                  <label>Notes</label>
                  <textarea
                    rows={4}
                    placeholder="Quality feedback, scoring breakdown, lessons learned, price analysis..."
                    value={form.notes}
                    onChange={e => update('notes', e.target.value)}
                  />
                </div>
              </div>
              <div className="dialog-actions" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete result"
        message="Are you sure you want to delete this result? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
