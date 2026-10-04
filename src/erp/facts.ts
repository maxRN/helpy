// ProcureFlow's business facts for grounding and redaction (see src/shared/grounding.ts).
// Personal data (contact names, emails, bank accounts) is deliberately not in here.
import type { BusinessFacts } from '../shared/grounding'
import { COST_CENTERS, type Invoice } from './model'
import { COMPANY_NAME } from './seed'

export function erpFacts(invoices: Record<string, Invoice>): BusinessFacts {
  const all = Object.values(invoices)
  const terms = new Set<string>([COMPANY_NAME, ...COST_CENTERS.flatMap((c) => [c.code, c.name])])
  for (const i of all) for (const term of [i.number, i.poNumber, i.supplierId, i.supplierName]) if (term) terms.add(term)
  return { invoiceIds: all.map((i) => i.number), terms: [...terms] }
}
