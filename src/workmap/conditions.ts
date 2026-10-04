// Guardrail conditions in plain English, for the Work Map view and the agent export.
import { SUPPLIERS } from '../erp/catalog'
import { CATEGORIES, formatEUR, STATUS_LABEL, type InvoiceStatus } from '../erp/model'
import type { Condition, Guardrail, InvoiceField } from '../shared/types'

const FIELD_LABEL: Record<InvoiceField, string> = {
  amount: 'amount',
  category: 'category',
  supplierId: 'supplier',
  supplierCountry: 'supplier country',
  supplierVerified: 'supplier is in the vendor master',
  month: 'invoice month',
  costCenter: 'cost center',
  account: 'GL account',
  assetNumber: 'asset number',
  approvalRequested: '2nd approval requested',
  status: 'status',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatOne(field: InvoiceField, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  switch (field) {
    case 'amount':
      return Number.isInteger(Number(v)) ? `€${Number(v).toLocaleString('en-IE')}` : formatEUR(Number(v))
    case 'month':
      return MONTHS[Number(v) - 1] ?? String(v)
    case 'supplierId':
      return SUPPLIERS.find((s) => s.id === v)?.name ?? String(v)
    case 'category':
      return CATEGORIES.find((c) => c.value === v)?.label.toLowerCase() ?? String(v)
    case 'status':
      return STATUS_LABEL[v as InvoiceStatus]?.toLowerCase() ?? String(v)
    default:
      return String(v)
  }
}

export function formatValue(field: InvoiceField, v: unknown): string {
  return Array.isArray(v) ? v.map((x) => formatOne(field, x)).join(' or ') : formatOne(field, v)
}

export function describeCondition(c: Condition): string {
  const label = FIELD_LABEL[c.field] ?? c.field
  // Boolean fields read better as statements: "supplier is in the vendor master: no".
  if (typeof c.value === 'boolean' && (c.op === 'eq' || c.op === 'neq')) {
    const yes = (c.op === 'eq') === c.value
    return c.field === 'supplierVerified' ? (yes ? 'the supplier is in the vendor master' : 'the supplier is not in the vendor master') : `${label}: ${yes ? 'yes' : 'no'}`
  }
  const value = formatValue(c.field, c.value)
  switch (c.op) {
    case 'eq':
      return `${label} is ${value}`
    case 'neq':
      return `${label} is not ${value}`
    case 'gt':
      return `${label} is over ${value}`
    case 'lt':
      return `${label} is under ${value}`
    case 'in':
      return `${label} is ${value}`
    case 'empty':
      return `${label} is empty`
    case 'not_empty':
      return `${label} is filled in`
  }
}

/** "When category is equipment and amount is over $5,000 → GL account must be capex." */
export function describeGuardrailLogic(g: Guardrail): { when: string; require: string } {
  return {
    when: g.when.length ? g.when.map(describeCondition).join(' and ') : 'always',
    require: g.require.map(describeCondition).join(' and '),
  }
}
