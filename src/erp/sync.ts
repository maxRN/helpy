// Where ERP changes go besides the local store. ConvexSync (React) plugs Convex in;
// without it (tests, no backend) the ERP still works locally.
import type { WorkMap } from '../shared/types'
import type { Invoice } from './model'

export type InvoiceChanges = Partial<
  Pick<Invoice, 'category' | 'costCenter' | 'account' | 'assetNumber' | 'approver' | 'approvalRequested' | 'status' | 'note'>
>

export interface ErpSync {
  patchInvoice: (invoiceId: string, changes: InvoiceChanges) => void
  resetInvoices: () => void
  saveWorkMap: (sessionId: string, workMap: WorkMap) => void
}

let current: ErpSync | null = null

export const setErpSync = (sync: ErpSync | null) => {
  current = sync
}

export const erpSync = () => current

/** The fields that differ between two versions of an invoice, limited to what users can change. */
export function diffInvoice(before: Invoice, after: Invoice): InvoiceChanges {
  const keys = ['category', 'costCenter', 'account', 'assetNumber', 'approver', 'approvalRequested', 'status', 'note'] as const
  const changes: Record<string, unknown> = {}
  for (const k of keys) if (before[k] !== after[k]) changes[k] = after[k]
  return changes as InvoiceChanges
}
