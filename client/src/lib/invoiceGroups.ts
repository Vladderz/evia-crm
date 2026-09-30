/**
 * Group the invoice list into invoices, where every non-void row that
 * shares an invoice_number and client is one invoice and each row is
 * an item on it. Migration 022 removed the UNIQUE rule on
 * invoices.invoice_number to make this possible; this helper is the
 * single source of truth for how the Income page and Active Tenders
 * see those groups.
 *
 * Same client rule (matches the server in routes/invoices.js):
 *   - equal client_id when both rows have one
 *   - otherwise equal client_name, trimmed and case-insensitive
 *   - never partial matches
 *
 * Void rows are grouped by (invoice_number, voided_at) so a
 * hypothetical second void batch of the same number stays distinct
 * from the first. Rows with no number stand alone: each is its own
 * "group" of one.
 */

import type { Invoice } from './types';

export type InvoiceGroupState = 'awaiting' | 'overdue' | 'paid' | 'void';

export interface InvoiceGroup {
  /** Stable React key. Not meaningful for URLs. */
  key: string;
  /** May be null when items have no invoice_number. */
  number: string | null;
  clientId: number | null;
  clientName: string;
  items: Invoice[];
  net: number;
  vat: number;
  total: number;
  amountReceived: number | null;
  issueDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  state: InvoiceGroupState;
  daysOverdue: number | null;
  daysToPay: number | null;
  itemCount: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function sameClientKey(inv: Invoice): string {
  if (inv.client_id != null) return `id:${inv.client_id}`;
  const name = (inv.client_name || '').trim().toLowerCase();
  return `name:${name}`;
}

function groupKey(inv: Invoice, ordinal: number): string {
  const number = (inv.invoice_number || '').trim();
  if (!number) return `__solo__:${ordinal}`;
  if (inv.state === 'void') {
    return `void:${number}:${sameClientKey(inv)}:${inv.voided_at ?? ''}`;
  }
  return `live:${number}:${sameClientKey(inv)}`;
}

function pickState(items: Invoice[]): InvoiceGroupState {
  if (items[0]?.state === 'void') return 'void';
  // Any overdue item pulls the invoice into overdue (shared paid_date
  // means every item flips together anyway).
  if (items.some(i => i.state === 'overdue')) return 'overdue';
  if (items.every(i => i.state === 'paid')) return 'paid';
  return 'awaiting';
}

/**
 * Build the list of groups from the raw invoice array. Items inside a
 * group are sorted by id (ascending) so display order is stable.
 * Groups are returned in the order their first item appeared in the
 * input, so callers can layer their own sort on top without losing
 * that anchor.
 */
export function buildInvoiceGroups(invoices: Invoice[]): InvoiceGroup[] {
  const map = new Map<string, InvoiceGroup>();
  let solo = 0;
  for (const inv of invoices) {
    const key = groupKey(inv, solo++);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        number: inv.invoice_number ?? null,
        clientId: inv.client_id ?? null,
        clientName: inv.client_name,
        items: [],
        net: 0,
        vat: 0,
        total: 0,
        amountReceived: null,
        issueDate: inv.issue_date ?? null,
        dueDate: inv.due_date ?? null,
        paidDate: inv.paid_date ?? null,
        state: 'awaiting',
        daysOverdue: inv.days_overdue ?? null,
        daysToPay: inv.days_to_pay ?? null,
        itemCount: 0,
      };
      map.set(key, g);
    }
    g.items.push(inv);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => a.id - b.id);
    const first = g.items[0]!;
    g.number = first.invoice_number ?? null;
    g.clientId = first.client_id ?? null;
    g.clientName = first.client_name;
    g.issueDate = first.issue_date ?? null;
    g.dueDate = first.due_date ?? null;
    g.paidDate = first.paid_date ?? null;
    g.daysOverdue = first.days_overdue ?? null;
    g.daysToPay = first.days_to_pay ?? null;
    g.net = Math.round(g.items.reduce((s, i) => s + toNum(i.net_amount), 0) * 100) / 100;
    g.vat = Math.round(g.items.reduce((s, i) => s + toNum(i.vat_amount), 0) * 100) / 100;
    g.total = Math.round((g.net + g.vat) * 100) / 100;
    const anyReceived = g.items.some(i => i.amount_received != null);
    g.amountReceived = anyReceived
      ? Math.round(g.items.reduce((s, i) => s + toNum(i.amount_received), 0) * 100) / 100
      : null;
    g.state = pickState(g.items);
    g.itemCount = g.items.length;
  }
  return Array.from(map.values());
}

/**
 * A client's open invoices: non-void groups with no paid_date, matched
 * by the same-client rule. Used by the InvoiceDrawer's "Add to an
 * existing invoice" flow.
 */
export function openInvoicesForClient(
  invoices: Invoice[],
  clientId: number | null,
  clientName: string,
): InvoiceGroup[] {
  const target = { client_id: clientId, client_name: clientName } as Invoice;
  const targetKey = sameClientKey(target);
  const groups = buildInvoiceGroups(invoices).filter(g => {
    if (g.state === 'void' || g.state === 'paid') return false;
    if (!g.number) return false;
    const first = g.items[0]!;
    return sameClientKey(first) === targetKey;
  });
  groups.sort((a, b) => {
    const ai = a.issueDate ?? '';
    const bi = b.issueDate ?? '';
    if (ai !== bi) return ai.localeCompare(bi);
    return (a.number ?? '').localeCompare(b.number ?? '');
  });
  return groups;
}

/**
 * Given a single invoice item, find every other item that shares its
 * invoice (same trimmed number, same client, both non-void, or same
 * void batch). Used to render the "part of INV-007" state alongside
 * the item.
 */
export function siblingsOf(
  invoices: Invoice[],
  item: Invoice,
): Invoice[] {
  const number = (item.invoice_number || '').trim();
  if (!number) return [item];
  const key = sameClientKey(item);
  const isVoid = item.state === 'void';
  return invoices.filter(i => {
    if ((i.invoice_number || '').trim() !== number) return false;
    if (sameClientKey(i) !== key) return false;
    if (isVoid) return i.state === 'void' && i.voided_at === item.voided_at;
    return i.state !== 'void';
  }).sort((a, b) => a.id - b.id);
}
