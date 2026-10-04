// Grounding: what Helpy says or stores about invoices must exist in the app's data.
// The visible app registers its business facts (ProcureFlow: invoice numbers, PO numbers, supplier ids
// and names, cost centers, company name). They are used twice:
// - capture: PII redaction must not paint over them (the redaction model mistakes invoice numbers for
//   building numbers and cost centers for ZIP codes; a synthetic "42" on the screenshot became "invoice 42");
// - grounding: an invoice number in a model's output that the app does not know is never said or stored.

export interface BusinessFacts {
  /** Invoice numbers that exist. */
  invoiceIds: string[]
  /** Business identifiers and names shown on screen that are not personal data. */
  terms: string[]
}

let provider: (() => BusinessFacts) | null = null

export function registerBusinessFacts(fn: (() => BusinessFacts) | null) {
  provider = fn
}

export function businessFacts(): BusinessFacts {
  try {
    return provider?.() ?? { invoiceIds: [], terms: [] }
  } catch {
    return { invoiceIds: [], terms: [] }
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * [start, end) of every occurrence of `term` in `text` that is not part of a longer word or number.
 * Any whitespace in the term matches any whitespace in the text (OCR wraps lines).
 */
export function termOccurrences(text: string, term: string): Array<[number, number]> {
  const words = term.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu')
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length])
}

/** Drops detected PII spans that overlap business terms or explicit invoice numbers. */
export function withoutBusinessTerms<S extends { start: number; end: number }>(text: string, spans: S[], terms: readonly string[]): S[] {
  const keep = [...terms, ...invoiceRefs(text)].flatMap((term) => termOccurrences(text, term))
  return spans.filter((s) => !keep.some(([a, b]) => a < s.end && s.start < b))
}

// "invoice 4471", "Invoice No. 4471", "invoice #4471", "Rechnung Nr. 4471", "Rechnung 4471"
const INVOICE_REF = /\b(?:invoices?|inv\.|rechnung(?:en)?|rechnungsnummer)\s*(?:no\.?|nr\.?|number|nummer|#)?\s*#?\s*(\d{1,12})\b/giu

/** Invoice numbers a text refers to. */
export function invoiceRefs(text: string): string[] {
  return [...text.matchAll(INVOICE_REF)].map((m) => m[1])
}

/**
 * Invoice numbers in `text` that the app does not know. Without registered facts nothing can be
 * checked, so nothing is reported.
 */
export function ungroundedInvoiceRefs(text: string, known: readonly string[] = businessFacts().invoiceIds): string[] {
  if (!known.length) return []
  const ids = new Set(known)
  return invoiceRefs(text).filter((id) => !ids.has(id))
}

/** Replaces references to invoices the app does not know with words that claim no number. */
export function scrubUngroundedInvoices(text: string, known: readonly string[] = businessFacts().invoiceIds): string {
  if (!known.length) return text
  const ids = new Set(known)
  return text.replace(INVOICE_REF, (all, id: string) => (ids.has(id) ? all : 'an invoice (number not readable)'))
}
