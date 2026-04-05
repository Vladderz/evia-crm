import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import type { Client, Tender } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ToastProvider'
import StatsBar from '../components/StatsBar'
import ViewToggle from '../components/ViewToggle'
import TenderCard from '../components/TenderCard'
import TenderForm from '../components/TenderForm'
import SlidePanel from '../components/SlidePanel'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  formatDate,
  getDeadlineCountdown,
  formatCurrency,
  getStatusLabel,
  getStatusColor,
} from '../lib/tenderUtils'

interface TenderStats {
  active: number
  submitted: number
  pipeline_value: number
  won_value: number
  won_fees: number
  won_count: number
  lost_count: number
}

const STATUS_LABELS: Record<string, string> = {
  questionnaire_sent: 'Questionnaire Sent',
  writing: 'Writing',
  submitted: 'Submitted / Awaiting Result',
}

function fmtCurrency(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB')
}

export default function ActiveTenders() {
  const { user } = useAuth()
  const toast = useToast()

  const [viewIndex, setViewIndex] = useState(0) // 0 = Live Pipeline, 1 = Results
  const [liveTenders, setLiveTenders] = useState<Tender[]>([])
  const [resultsTenders, setResultsTenders] = useState<Tender[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [stats, setStats] = useState<TenderStats>({
    active: 0, submitted: 0, pipeline_value: 0, won_value: 0, won_fees: 0, won_count: 0, lost_count: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Live Pipeline filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')

  // Results filters
  const [resultFilter, setResultFilter] = useState('')

  // Panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingTender, setEditingTender] = useState<Tender | null>(null)
  const [formKey, setFormKey] = useState(0)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Tender | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [liveRes, resultsRes, statsRes, clientsRes] = await Promise.all([
        api.get('/tenders?view=live'),
        api.get('/tenders?view=results'),
        api.get('/tenders/stats'),
        api.get('/clients'),
      ])
      setLiveTenders(liveRes.data)
      setResultsTenders(resultsRes.data)
      setStats(statsRes.data)
      setClients(
        (clientsRes.data as Client[]).sort((a, b) =>
          a.company_name.localeCompare(b.company_name)
        )
      )
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered live tenders
  const visibleLive = liveTenders.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false
    if (assignedFilter && t.assigned_to !== assignedFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      return (
        t.title.toLowerCase().includes(q) ||
        (t.buyer ?? '').toLowerCase().includes(q) ||
        (t.client_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Filtered results tenders
  const visibleResults = resultsTenders.filter(t => {
    if (resultFilter && t.status !== resultFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      return (
        t.title.toLowerCase().includes(q) ||
        (t.buyer ?? '').toLowerCase().includes(q) ||
        (t.client_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  function openAdd() {
    setEditingTender(null)
    setFormKey(k => k + 1)
    setPanelOpen(true)
  }

  function openEdit(tender: Tender) {
    setEditingTender(tender)
    setFormKey(k => k + 1)
    setPanelOpen(true)
  }

  function handleViewChange(index: number) {
    setViewIndex(index)
    setSearch('')
    setDebouncedSearch('')
  }

  async function handleAdvance(tender: Tender, newStatus: string) {
    try {
      await api.put(`/tenders/${tender.id}`, { status: newStatus })
      toast.success(`Moved to ${STATUS_LABELS[newStatus] ?? newStatus}`)
      fetchData()
    } catch {
      toast.error('Failed to update status. Please try again.')
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const title = deleteTarget.title
    try {
      await api.delete(`/tenders/${deleteTarget.id}`)
      toast.success(`${title} deleted`)
      setDeleteTarget(null)
      fetchData()
    } catch {
      toast.error('Failed to delete tender. Please try again.')
      setDeleteTarget(null)
    }
  }

  const totalDecided = stats.won_count + stats.lost_count
  const winRateDisplay = totalDecided > 0
    ? `${stats.won_count} of ${totalDecided} (${Math.round((stats.won_count / totalDecided) * 100)}%)`
    : '-'

  const statItems = [
    { label: 'Active Tenders', value: stats.active },
    { label: 'Submitted', value: stats.submitted },
    { label: 'Pipeline Value', value: fmtCurrency(stats.pipeline_value) },
    { label: 'Won Value', value: fmtCurrency(stats.won_value) },
    { label: 'Won Fees', value: fmtCurrency(stats.won_fees) },
    { label: 'Win Rate', value: winRateDisplay },
  ]

  if (loading) {
    return <LoadingSpinner message="Loading tenders..." />
  }

  if (loadError) {
    return (
      <div className="page-error">
        <p>Something went wrong loading tenders. Please try again.</p>
        <button className="btn btn-primary" onClick={fetchData}>Retry</button>
      </div>
    )
  }

  const isLive = viewIndex === 0

  return (
    <div className="page-tenders">
      <StatsBar stats={statItems} className="stats-bar-6" />

      <ViewToggle
        options={['Live Pipeline', 'Results']}
        activeIndex={viewIndex}
        onChange={handleViewChange}
      />

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="toolbar-search"
            placeholder="Search tenders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {isLive ? (
            <>
              <select
                className="toolbar-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">All Live</option>
                <option value="questionnaire_sent">Questionnaire Sent</option>
                <option value="writing">Writing</option>
                <option value="submitted">Submitted / Awaiting Result</option>
              </select>
              <select
                className="toolbar-select"
                value={assignedFilter}
                onChange={e => setAssignedFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="Vlad">Vlad</option>
                <option value="Tristan">Tristan</option>
                <option value="Both">Both</option>
              </select>
            </>
          ) : (
            <select
              className="toolbar-select"
              value={resultFilter}
              onChange={e => setResultFilter(e.target.value)}
            >
              <option value="">All Results</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          )}
        </div>
        {isLive && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Tender</button>
        )}
      </div>

      {/* Live Pipeline table */}
      {isLive ? (
        visibleLive.length === 0 ? (
          <div className="empty-state">
            {liveTenders.length === 0 ? (
              <>
                <p>No active tenders. Add your first tender to get started.</p>
                <button
                  className="btn btn-primary"
                  onClick={openAdd}
                  style={{ marginTop: '16px' }}
                >
                  + Add Tender
                </button>
              </>
            ) : (
              <p>No tenders match your search or filter.</p>
            )}
          </div>
        ) : (
          <div className="tenders-table-wrapper">
            <table className="tenders-table">
              <thead>
                <tr>
                  <th>Tender</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Client</th>
                  <th>Value</th>
                  <th>Fee</th>
                  <th>Assigned</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleLive.map(tender => {
                  const countdown = getDeadlineCountdown(tender.submission_deadline)
                  return (
                    <tr key={tender.id}>
                      <td className="td-tender-title">
                        {tender.tender_url ? (
                          <a href={tender.tender_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                            {tender.title}
                          </a>
                        ) : (
                          tender.title
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusColor(tender.status)}`}>
                          {getStatusLabel(tender.status)}
                        </span>
                      </td>
                      <td>
                        {tender.submission_deadline ? (
                          <>
                            {formatDate(tender.submission_deadline)}{' '}
                            {countdown.colorClass ? (
                              <span className={countdown.colorClass}>({countdown.text})</span>
                            ) : null}
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {tender.client_name ? (
                          tender.client_name
                        ) : (
                          <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No client</span>
                        )}
                      </td>
                      <td>{formatCurrency(tender.estimated_value)}</td>
                      <td>{formatCurrency(tender.evia_fee)}</td>
                      <td>{tender.assigned_to ?? ''}</td>
                      <td className="td-actions">
                        {tender.status === 'questionnaire_sent' && (
                          <button
                            className="btn-advance"
                            type="button"
                            onClick={() => handleAdvance(tender, 'writing')}
                          >
                            Move to Writing
                          </button>
                        )}
                        {tender.status === 'writing' && (
                          <button
                            className="btn-advance"
                            type="button"
                            onClick={() => handleAdvance(tender, 'submitted')}
                          >
                            Move to Submitted
                          </button>
                        )}
                        {tender.status === 'submitted' && (
                          <>
                            <button
                              className="btn-advance"
                              type="button"
                              onClick={() => handleAdvance(tender, 'won')}
                            >
                              Mark Won
                            </button>
                            <button
                              className="btn-mark-lost"
                              type="button"
                              onClick={() => handleAdvance(tender, 'lost')}
                            >
                              Mark Lost
                            </button>
                          </>
                        )}
                        <button
                          className="btn-edit"
                          type="button"
                          onClick={() => openEdit(tender)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          type="button"
                          onClick={() => setDeleteTarget(tender)}
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
        )
      ) : (
        visibleResults.length === 0 ? (
          <div className="empty-state">
            {resultsTenders.length === 0 ? (
              <p>No results yet. Tenders will appear here once marked as Won or Lost.</p>
            ) : (
              <p>No tenders match your search or filter.</p>
            )}
          </div>
        ) : (
          <div className="tenders-grid">
            {visibleResults.map(tender => (
              <TenderCard
                key={tender.id}
                tender={tender}
                view="results"
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onAdvance={handleAdvance}
              />
            ))}
          </div>
        )
      )}

      {/* Add / Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editingTender ? `Edit ${editingTender.title}` : 'Add Tender'}
      >
        <TenderForm
          key={formKey}
          tender={editingTender}
          clients={clients}
          currentUserName={user?.name ?? ''}
          onSuccess={() => { fetchData(); setPanelOpen(false) }}
          onClose={() => setPanelOpen(false)}
        />
      </SlidePanel>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Tender"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.title}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
