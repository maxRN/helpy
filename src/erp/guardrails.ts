import type { Condition, Guardrail, InvoiceField } from '../shared/types'
import type { Invoice } from './model'

export interface Violation {
  guardrail: Guardrail
  failed: Condition[] // the require-conditions that were not met
}

const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === false

export function fieldValue(invoice: Invoice, field: InvoiceField): unknown {
  return invoice[field]
}

export function conditionHolds(invoice: Invoice, c: Condition): boolean {
  const actual = fieldValue(invoice, c.field)
  switch (c.op) {
    case 'eq':
      return norm(actual) === norm(c.value)
    case 'neq':
      return norm(actual) !== norm(c.value)
    case 'gt':
      return Number(actual) > Number(c.value)
    case 'lt':
      return Number(actual) < Number(c.value)
    case 'in':
      return Array.isArray(c.value) && c.value.map(norm).includes(norm(actual))
    case 'empty':
      return isEmpty(actual)
    case 'not_empty':
      return !isEmpty(actual)
  }
}

/** A guardrail is relevant when all of its `when` conditions match the invoice. */
export const isRelevant = (invoice: Invoice, g: Guardrail) => g.when.every((c) => conditionHolds(invoice, c))

/** Every relevant guardrail with at least one unmet `require` condition. */
export function evaluateGuardrails(invoice: Invoice, guardrails: Guardrail[]): Violation[] {
  const violations: Violation[] = []
  for (const g of guardrails) {
    if (!isRelevant(invoice, g)) continue
    const failed = g.require.filter((c) => !conditionHolds(invoice, c))
    if (failed.length > 0) violations.push({ guardrail: g, failed })
  }
  return violations
}
