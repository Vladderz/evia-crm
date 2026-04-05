import type { Client } from '../lib/types'

interface Props {
  client: Client
  onEdit: (client: Client) => void
  onDelete: (client: Client) => void
}

const STATUS_LABELS: Record<string, string> = {
  active_client: 'Active Client',
  prospect: 'Prospect',
  seeking_tender: 'Seeking Tender',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ClientCard({ client, onEdit, onDelete }: Props) {
  return (
    <div className={`client-card status-border-${client.status}`}>
      <div className="client-card-header">
        <div className="client-card-name-wrap">
          {client.website ? (
            <a
              href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="client-card-name link"
            >
              {client.company_name}
            </a>
          ) : (
            <span className="client-card-name">{client.company_name}</span>
          )}
        </div>
        <span className={`status-badge status-${client.status}`}>
          {STATUS_LABELS[client.status] ?? client.status}
        </span>
      </div>

      {client.contact_name && (
        <p className="client-contact-name">{client.contact_name}</p>
      )}

      {(client.email || client.phone) && (
        <p className="client-contact-details">
          {client.email && (
            <a href={`mailto:${client.email}`} className="client-contact-link">{client.email}</a>
          )}
          {client.email && client.phone && <span className="contact-sep"> &middot; </span>}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="client-contact-link">{client.phone}</a>
          )}
        </p>
      )}

      {(client.sector || client.region) && (
        <div className="client-badges">
          {client.sector && <span className="pill">{client.sector}</span>}
          {client.region && <span className="pill">{client.region}</span>}
        </div>
      )}

      {client.notes && (
        <p className="client-notes">{client.notes}</p>
      )}

      <div className="client-card-footer">
        <span className="client-meta">
          {client.created_by_name ? `Added by ${client.created_by_name}` : 'Added'} &middot; {formatDate(client.created_at)}
        </span>
        <div className="client-card-actions">
          <button className="btn-card-edit" onClick={() => onEdit(client)}>Edit</button>
          <button className="btn-card-delete" onClick={() => onDelete(client)}>Delete</button>
        </div>
      </div>
    </div>
  )
}
