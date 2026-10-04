export type InvoiceStatus = 'open' | 'on_hold' | 'awaiting_approval' | 'posted'
export type Category = 'equipment' | 'office' | 'services' | 'raw_materials' | 'software' | 'intercompany'
export type Account = 'opex' | 'capex'

export interface LineItem {
  description: string
  qty: number
  unitPrice: number
}

export interface Invoice {
  id: string
  number: string
  supplierId: string
  supplierName: string
  supplierCountry: string // ISO code, e.g. "DE", "CZ"
  supplierAddress: string
  supplierVerified: boolean // false: supplier is not in the vendor master yet
  invoiceDate: string // ISO date
  dueDate: string
  month: number // 1–12, derived from invoiceDate, used by guardrails
  poNumber: string
  lines: LineItem[]
  amount: number // EUR, sum of lines
  category: Category
  costCenter: string
  account: Account
  assetNumber: string
  approver: string
  approvalRequested: boolean
  status: InvoiceStatus
  note: string // reason typed when holding or asking for approval; visible on screen for the vision model
  // PII, masked before frames go to a model (data-pii)
  bankAccount: string
  contactName: string
  contactEmail: string
  // Demo flags
  teachOnly?: boolean // only visible in Teach mode
}

export interface CostCenter {
  code: string
  name: string
  account: Account
}

export const COST_CENTERS: CostCenter[] = [
  { code: '4711', name: 'Production – Maintenance', account: 'opex' },
  { code: '0400', name: 'Capital Equipment', account: 'capex' },
  { code: '4100', name: 'Office & Admin', account: 'opex' },
  { code: '4300', name: 'IT & Software', account: 'opex' },
  { code: '4500', name: 'Logistics', account: 'opex' },
  { code: '4800', name: 'Intercompany Services', account: 'opex' },
]

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'raw_materials', label: 'Raw materials' },
  { value: 'services', label: 'Services' },
  { value: 'software', label: 'Software' },
  { value: 'office', label: 'Office supplies' },
  { value: 'intercompany', label: 'Intercompany' },
]

export const APPROVERS = ['', 'M. Weber (Controller)', 'J. Novak (Finance Brno)', 'T. Fischer (CFO)']

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: 'Open',
  on_hold: 'On hold',
  awaiting_approval: 'Awaiting approval',
  posted: 'Posted',
}

export const accountFor = (costCenter: string): Account =>
  COST_CENTERS.find((c) => c.code === costCenter)?.account ?? 'opex'

/** Euro amounts, English UI: "€6,800.00". */
export const formatEUR = (n: number) =>
  n.toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })

/** European date order: "21 Sep 2026". */
export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
