// What the ERP exposes to the models: element ids (for Work Map steps and the mascot)
// and invoice fields with their allowed values (for guardrail conditions).
// P3 puts catalogForPrompt() into the Work Map prompt; P2 uses TARGETS for point_to.
import { INVOICE_FIELDS, type InvoiceField } from '../shared/types'
import { CATEGORIES, COST_CENTERS } from './model'
import { ALL_INVOICES } from './seed'
import { actionTarget, fieldTarget, PREVIEW_TARGET, VENDOR_TARGET } from './targetIds'

export interface TargetInfo {
  id: string
  label: string
  description: string
}

export const TARGETS: TargetInfo[] = [
  { id: PREVIEW_TARGET, label: 'Invoice document', description: 'The supplier invoice as a document: supplier, address, invoice and PO number, line items, total, remit-to.' },
  { id: VENDOR_TARGET, label: 'Vendor master status', description: 'Shows whether the supplier is verified in the vendor master or unknown.' },
  { id: fieldTarget('category'), label: 'Category', description: 'What was bought: equipment, raw materials, services, software, office supplies, intercompany.' },
  { id: fieldTarget('costCenter'), label: 'Cost center', description: 'Cost center code. It decides the GL account: 0400 is capex, every other code is opex.' },
  { id: fieldTarget('assetNumber'), label: 'Asset no.', description: 'Fixed-asset number, needed for capex postings.' },
  { id: fieldTarget('approver'), label: 'Approver', description: 'Person who approves the invoice.' },
  { id: actionTarget('hold'), label: 'Hold', description: 'Puts the invoice on hold instead of posting it.' },
  { id: actionTarget('request_approval'), label: 'Request 2nd approval', description: 'Sends the invoice to a second approver before it can be posted.' },
  { id: actionTarget('post'), label: 'Post', description: 'Books the invoice. This is where money moves.' },
]

export const TARGET_IDS = TARGETS.map((t) => t.id)

/** Invoice rows in the inbox use `row-<invoiceId>`, e.g. row-4471. */
export const ROW_TARGET_PATTERN = 'row-<invoiceId>'

export interface SupplierInfo {
  id: string
  name: string
  country: string
}

export const SUPPLIERS: SupplierInfo[] = [
  ...new Map(ALL_INVOICES.map((i) => [i.supplierId, { id: i.supplierId, name: i.supplierName, country: i.supplierCountry }])).values(),
]

interface FieldInfo {
  type: 'number' | 'string' | 'boolean'
  description: string
  values?: (string | number | boolean)[]
}

export const FIELD_VOCABULARY: Record<InvoiceField, FieldInfo> = {
  amount: { type: 'number', description: 'Invoice total in EUR.' },
  category: { type: 'string', description: 'What was bought.', values: CATEGORIES.map((c) => c.value) },
  supplierId: { type: 'string', description: 'Supplier id. Map supplier names to ids with the supplier list.', values: SUPPLIERS.map((s) => s.id) },
  supplierCountry: { type: 'string', description: 'ISO country code of the supplier.', values: [...new Set(SUPPLIERS.map((s) => s.country))] },
  supplierVerified: { type: 'boolean', description: 'False when the supplier is not in the vendor master yet (a new or unknown supplier).' },
  month: { type: 'number', description: 'Month of the invoice date, 1–12 (December is 12). Quarter-end months are 3, 6, 9 and 12.' },
  costCenter: { type: 'string', description: 'Cost center code.', values: COST_CENTERS.map((c) => c.code) },
  account: { type: 'string', description: 'GL account, derived from the cost center.', values: ['opex', 'capex'] },
  assetNumber: { type: 'string', description: 'Fixed-asset number, empty if none.' },
  approvalRequested: { type: 'boolean', description: 'True once a second approval was requested.' },
  status: { type: 'string', description: 'Invoice status after the action.', values: ['open', 'on_hold', 'awaiting_approval', 'posted'] },
}

/** Plain-text description of the ERP for model prompts. Stable text, good for prompt caching. */
export function catalogForPrompt(): string {
  const targets = TARGETS.map((t) => `- ${t.id}: ${t.label}. ${t.description}`).join('\n')
  const fields = INVOICE_FIELDS.map((f) => {
    const info = FIELD_VOCABULARY[f]
    const values = info.values ? ` Allowed values: ${info.values.join(', ')}.` : ''
    return `- ${f} (${info.type}): ${info.description}${values}`
  }).join('\n')
  const suppliers = SUPPLIERS.map((s) => `- ${s.id}: ${s.name} (${s.country})`).join('\n')
  const costCenters = COST_CENTERS.map((c) => `- ${c.code}: ${c.name} (${c.account})`).join('\n')
  return [
    'ERP: ProcureFlow, accounts payable at Hartmann Machine Works, a machine builder near Stuttgart, Germany. All amounts in EUR.',
    `Screen elements (use these ids as targetId). Inbox rows are ${ROW_TARGET_PATTERN}.\n${targets}`,
    `Invoice fields (use these in guardrail conditions):\n${fields}`,
    `Suppliers:\n${suppliers}`,
    `Cost centers:\n${costCenters}`,
  ].join('\n\n')
}
