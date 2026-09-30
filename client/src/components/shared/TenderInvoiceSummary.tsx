import { CheckCircle2, Receipt, Send } from 'lucide-react';
import { Badge, type BadgeVariant } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { formatDate, formatMoney } from '../../lib/format';
import type { Invoice } from '../../lib/types';

/**
 * Shows the invoice a tender is currently focused on: the earliest-issued
 * unpaid non-void invoice if there is one, otherwise the most recently
 * paid invoice. Rendered inside the ExpandPanel row on Active Tenders
 * and inside the tender Edit drawer.
 *
 * Two variants keep the styling in step with each caller:
 * - 'expand': the row expand panel. Empty state renders nothing, to
 *   preserve the current behaviour of the Active Tenders row.
 * - 'drawer': the tender Edit drawer. Wrapped in the same panel style
 *   as the top Type / Stage / Status / Chasing group. Empty state
 *   renders "Not invoiced" + a Mark Invoice Sent button.
 */
export interface TenderInvoiceSummaryProps {
  invoice: Invoice | null | undefined;
  otherInvoiceCount: number;
  variant: 'expand' | 'drawer';
  onMarkInvoiceSent: () => void;
  onMarkInvoicePaid: (inv: Invoice) => void;
  onEditInvoice: (inv: Invoice) => void;
}

function invoiceBadge(inv: Invoice): { variant: BadgeVariant; label: string } | null {
  if (inv.state === 'paid')    return { variant: 'success', label: 'Paid' };
  if (inv.state === 'overdue') return { variant: 'danger',  label: 'Invoice Overdue' };
  if (inv.state === 'awaiting') return { variant: 'warning', label: 'Invoice Sent' };
  return null;
}

function daysToPayLabel(inv: Invoice): string | null {
  if (inv.state !== 'paid' || typeof inv.days_to_pay !== 'number') return null;
  if (inv.days_to_pay === 0) return 'Same day';
  if (inv.days_to_pay === 1) return '1 day';
  return `${inv.days_to_pay} days`;
}

export function TenderInvoiceSummary({
  invoice,
  otherInvoiceCount,
  variant,
  onMarkInvoiceSent,
  onMarkInvoicePaid,
  onEditInvoice,
}: TenderInvoiceSummaryProps) {
  // Empty state
  if (!invoice) {
    if (variant === 'expand') return null;
    return (
      <div className="drawer-group">
        <div className="field-label">Invoice</div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Not invoiced</span>
          <Button variant="secondary" size="sm" icon={Send} onClick={onMarkInvoiceSent}>
            Mark Invoice Sent
          </Button>
        </div>
      </div>
    );
  }

  const paid = invoice.state === 'paid';
  const daysLabel = daysToPayLabel(invoice);
  const badge = invoiceBadge(invoice);

  if (variant === 'expand') {
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="dt-expand-section-title">Invoice</div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              columnGap: 20,
              rowGap: 6,
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Invoice: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>
                {invoice.invoice_number ?? 'No number'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Amount: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>
                {formatMoney(invoice.total)}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Sent: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>
                {formatDate(invoice.issue_date)}
              </span>
            </div>
            {!paid && invoice.due_date && (
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Due: </span>
                <span style={{ color: 'var(--text-secondary-v1)' }}>
                  {formatDate(invoice.due_date)}
                </span>
              </div>
            )}
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Paid: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>
                {invoice.paid_date ? formatDate(invoice.paid_date) : 'Not yet'}
              </span>
            </div>
            {daysLabel && (
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Days to pay: </span>
                <span style={{ color: 'var(--text-secondary-v1)' }}>{daysLabel}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {!paid && (
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={() => onMarkInvoicePaid(invoice)}
              >
                Mark Paid
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={Receipt}
              onClick={() => onEditInvoice(invoice)}
            >
              Edit Invoice
            </Button>
          </div>
        </div>
        {otherInvoiceCount > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {otherInvoiceCount === 1
              ? '1 more invoice on the Income page'
              : `${otherInvoiceCount} more invoices on the Income page`}
          </div>
        )}
      </div>
    );
  }

  // Drawer variant: two-column grid, fits the 480px drawer.
  return (
    <div className="drawer-group">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="field-label" style={{ marginBottom: 0 }}>Invoice</span>
          {badge && <Badge variant={badge.variant} withDot>{badge.label}</Badge>}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: 16,
          rowGap: 6,
          fontSize: 12,
        }}
      >
        <div>
          <span style={{ color: 'var(--text-tertiary)' }}>Invoice: </span>
          <span style={{ color: 'var(--text-secondary-v1)' }}>
            {invoice.invoice_number ?? 'No number'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-tertiary)' }}>Amount: </span>
          <span style={{ color: 'var(--text-secondary-v1)' }}>
            {formatMoney(invoice.total)}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-tertiary)' }}>Sent: </span>
          <span style={{ color: 'var(--text-secondary-v1)' }}>
            {formatDate(invoice.issue_date)}
          </span>
        </div>
        {paid ? (
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Paid: </span>
            <span style={{ color: 'var(--text-secondary-v1)' }}>
              {invoice.paid_date ? formatDate(invoice.paid_date) : 'Not yet'}
            </span>
          </div>
        ) : (
          invoice.due_date && (
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>Due: </span>
              <span style={{ color: 'var(--text-secondary-v1)' }}>
                {formatDate(invoice.due_date)}
              </span>
            </div>
          )
        )}
        {paid && daysLabel && (
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Days to pay: </span>
            <span style={{ color: 'var(--text-secondary-v1)' }}>{daysLabel}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        {!paid && (
          <Button
            variant="primary"
            size="sm"
            icon={CheckCircle2}
            onClick={() => onMarkInvoicePaid(invoice)}
          >
            Mark Paid
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={Receipt}
          onClick={() => onEditInvoice(invoice)}
        >
          Edit Invoice
        </Button>
      </div>

      {otherInvoiceCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {otherInvoiceCount === 1
            ? '1 more invoice on the Income page'
            : `${otherInvoiceCount} more invoices on the Income page`}
        </div>
      )}
    </div>
  );
}
