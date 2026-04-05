import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react'
import api from '../lib/api'
import type { Client } from '../lib/types'
import StatsBar from '../components/StatsBar'
import SlidePanel from '../components/SlidePanel'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/ToastProvider'

interface Stats {
  total: number
  active_client: number
  seeking_tender: number
  prospect: number
}

const STATUS_LABELS: Record<string, string> = {
  active_client: 'Active Client',
  prospect: 'Prospect',
  seeking_tender: 'Seeking Tender',
}

const EMPTY_FORM = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  sector: '',
  region: '',
  status: 'prospect',
  notes: '',
  account_manager: 'vlad',
}

type SortKey = 'recent' | 'alpha' | 'oldest'

export default function ClientBook() {
  const toast = useToast()

  const [clients, setClients] = useState<Client[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active_client: 0, seeking_tender: 0, prospect: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('recent')

  const [panelOpen, setPanelOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [clientsRes, statsRes] = await Promise.all([
        api.get('/clients'),
        api.get('/clients/stats'),
      ])
      setClients(clientsRes.data)
      setStats(statsRes.data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered + sorted clients
  const visible = clients
    .filter(c => {
      if (statusFilter && c.status !== statusFilter) return false
      if (managerFilter) {
        const m = c.account_manager ?? 'vlad'
        if (managerFilter === 'both' && m !== 'both') return false
        if (managerFilter === 'vlad' && m !== 'vlad' && m !== 'both') return false
        if (managerFilter === 'tristan' && m !== 'tristan' && m !== 'both') return false
      }
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        return (
          c.company_name.toLowerCase().includes(q) ||
          (c.contact_name ?? '').toLowerCase().includes(q) ||
          (c.sector ?? '').toLowerCase().includes(q) ||
          (c.region ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortKey === 'alpha') return a.company_name.localeCompare(b.company_name)
      if (sortKey === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  function openAdd() {
    setEditingClient(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setPanelOpen(true)
  }

  function openEdit(client: Client) {
    setEditingClient(client)
    setForm({
      company_name: client.company_name,
      contact_name: client.contact_name ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      website: client.website ?? '',
      sector: client.sector ?? '',
      region: client.region ?? '',
      status: client.status,
      notes: client.notes ?? '',
      account_manager: client.account_manager ?? 'vlad',
    })
    setFormError('')
    setPanelOpen(true)
  }

  function handlePanelClose() {
    if (saving) return
    setPanelOpen(false)
  }

  function handleField(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) {
      setFormError('Company name is required')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, form)
        toast.success('Client updated successfully')
      } else {
        await api.post('/clients', form)
        toast.success('Client added successfully')
      }
      setPanelOpen(false)
      await fetchData()
    } catch {
      toast.error(editingClient ? 'Failed to update client. Please try again.' : 'Failed to add client. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await api.delete(`/clients/${deleteTarget.id}`)
      toast.success(`${deleteTarget.company_name} deleted`)
      setDeleteTarget(null)
      await fetchData()
    } catch {
      toast.error('Failed to delete client. Please try again.')
      setDeleteTarget(null)
    }
  }

  const statItems = [
    { label: 'Total Clients', value: stats.total },
    { label: 'Active Clients', value: stats.active_client },
    { label: 'Prospects', value: stats.prospect },
    { label: 'Seeking Tender', value: stats.seeking_tender },
  ]

  if (loading) {
    return <LoadingSpinner message="Loading clients..." />
  }

  if (loadError) {
    return (
      <div className="page-error">
        <p>Something went wrong loading clients. Please try again.</p>
        <button className="btn btn-primary" onClick={fetchData}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-clients">
      <StatsBar stats={statItems} />

      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="toolbar-search"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="toolbar-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active_client">Active Client</option>
            <option value="prospect">Prospect</option>
            <option value="seeking_tender">Seeking Tender</option>
          </select>
          <select
            className="toolbar-select"
            value={managerFilter}
            onChange={e => setManagerFilter(e.target.value)}
          >
            <option value="">All Managers</option>
            <option value="vlad">Vlad</option>
            <option value="tristan">Tristan</option>
            <option value="both">Both</option>
          </select>
          <select
            className="toolbar-select"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="recent">Most Recent</option>
            <option value="alpha">Alphabetical</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Client</button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          {clients.length === 0 ? (
            <>
              <p>No clients yet. Add your first client to get started.</p>
              <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: '16px' }}>+ Add Client</button>
            </>
          ) : (
            <p>No clients match your search or filter.</p>
          )}
        </div>
      ) : (
        <div className="clients-table-wrapper">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Sector</th>
                <th>Region</th>
                <th>Status</th>
                <th>Manager</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(client => {
                const managerLabel = client.account_manager === 'tristan' ? 'Tristan'
                  : client.account_manager === 'both' ? 'Both'
                  : 'Vlad'
                const websiteHref = client.website
                  ? (client.website.startsWith('http') ? client.website : `https://${client.website}`)
                  : null
                return (
                  <tr key={client.id}>
                    <td className="td-company-name">
                      {websiteHref ? (
                        <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="client-link">
                          {client.company_name}
                        </a>
                      ) : (
                        client.company_name
                      )}
                    </td>
                    <td>{client.contact_name || '-'}</td>
                    <td className="td-email">
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="client-link">{client.email}</a>
                      ) : '-'}
                    </td>
                    <td>{client.sector || '-'}</td>
                    <td>{client.region || '-'}</td>
                    <td>
                      <span className={`status-badge status-${client.status}`}>
                        {STATUS_LABELS[client.status] ?? client.status}
                      </span>
                    </td>
                    <td>{managerLabel}</td>
                    <td className="td-actions">
                      <button className="btn-edit" onClick={() => openEdit(client)}>Edit</button>
                      <button className="btn-delete" onClick={() => setDeleteTarget(client)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlidePanel
        open={panelOpen}
        onClose={handlePanelClose}
        title={editingClient ? `Edit ${editingClient.company_name}` : 'Add Client'}
      >
        <form onSubmit={handleSave} noValidate>
          {formError && <div className="alert alert-error">{formError}</div>}

          <div className="form-group">
            <label htmlFor="company_name">Company Name <span className="required">*</span></label>
            <input
              id="company_name"
              name="company_name"
              type="text"
              value={form.company_name}
              onChange={handleField}
              className={formError && !form.company_name.trim() ? 'input-error' : ''}
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_name">Contact Name</label>
            <input id="contact_name" name="contact_name" type="text" value={form.contact_name} onChange={handleField} />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleField} />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="text" value={form.phone} onChange={handleField} />
          </div>

          <div className="form-group">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" value={form.website} onChange={handleField} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label htmlFor="sector">Sector</label>
            <input id="sector" name="sector" type="text" value={form.sector} onChange={handleField} placeholder="e.g. Commercial Cleaning, Electrical" />
          </div>

          <div className="form-group">
            <label htmlFor="region">Region</label>
            <input id="region" name="region" type="text" value={form.region} onChange={handleField} placeholder="e.g. London, South East, Nationwide" />
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" value={form.status} onChange={handleField}>
              <option value="prospect">Prospect</option>
              <option value="active_client">Active Client</option>
              <option value="seeking_tender">Seeking Tender</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="account_manager">Account Manager</label>
            <select id="account_manager" name="account_manager" value={form.account_manager} onChange={handleField}>
              <option value="vlad">Vlad</option>
              <option value="tristan">Tristan</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={4} value={form.notes} onChange={handleField} />
          </div>

          <div className="panel-form-actions">
            <button type="button" className="btn btn-secondary" onClick={handlePanelClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Client'}
            </button>
          </div>
        </form>
      </SlidePanel>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Client"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.company_name}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
