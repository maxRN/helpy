// ProcureFlow describes its own visible screen for Helpy: exact values from the app state, and only
// what is actually rendered (nothing when the window is closed or minimized). No model is involved,
// so nothing here can be invented.
import { CATEGORIES, COST_CENTERS, formatEUR, STATUS_LABEL, type Invoice } from './model'
import { PREVIEW_TARGET, rowTarget } from './targetIds'

export interface ErpScreenInput {
  invoices: Record<string, Invoice>
  openId: string | null
  /** Is the element registered under this target id on screen (mounted, not hidden)? */
  visible: (targetId: string) => boolean
  /** Rule that blocked the latest posting, if its banner is showing. */
  blockedBy?: string[]
}

const MAX_ROWS = 8

const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v

function describeInvoice(i: Invoice, blockedBy: string[] = []): string {
  const cc = COST_CENTERS.find((c) => c.code === i.costCenter)
  const parts = [
    `ProcureFlow, invoice ${i.number} open: ${i.supplierName}`,
    `supplier ${i.supplierVerified ? 'verified in the vendor master' : 'NOT in the vendor master'}`,
    `country ${i.supplierCountry}`,
    `amount ${formatEUR(i.amount)}`,
    `category ${label(CATEGORIES, i.category)}`,
    `cost center ${i.costCenter}${cc ? ` ${cc.name} (${cc.account})` : ''}`,
    `asset no. ${i.assetNumber || 'empty'}`,
    `approver ${i.approver || 'none'}`,
    `status ${STATUS_LABEL[i.status]}`,
  ]
  if (i.note) parts.push(`note "${i.note}"`)
  if (blockedBy.length) parts.push(`posting stopped by a guardrail: ${blockedBy.join('; ')}`)
  return `${parts.join(', ')}.`
}

/** One or two sentences about what ProcureFlow shows right now; null when it is not on screen. */
export function describeErpScreen({ invoices, openId, visible, blockedBy }: ErpScreenInput): string | null {
  const open = openId ? invoices[openId] : undefined
  if (open && visible(PREVIEW_TARGET)) return describeInvoice(open, blockedBy)

  const rows = Object.values(invoices).filter((i) => visible(rowTarget(i.id)))
  if (!rows.length) return null
  const waiting = rows.filter((i) => i.status === 'open')
  const listed = waiting
    .slice(0, MAX_ROWS)
    .map((i) => `${i.number} ${i.supplierName} ${formatEUR(i.amount)}`)
    .join('; ')
  const more = waiting.length > MAX_ROWS ? `; and ${waiting.length - MAX_ROWS} more` : ''
  return `ProcureFlow inbox, no invoice open. ${waiting.length} open invoices${listed ? `: ${listed}${more}` : ''}.`
}
