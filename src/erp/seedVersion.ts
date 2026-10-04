// Is a stored ledger from an older version of the demo seed? Compares only what the app never changes
// (supplier, dates, amounts, lines), so a ledger someone has been working in is not mistaken for old.
import type { Invoice } from './model'

type Stored = Pick<Invoice, 'supplierId' | 'supplierName' | 'supplierAddress' | 'invoiceDate' | 'amount' | 'lines'> & { invoiceId: string }

const fixedFacts = (i: Omit<Stored, 'invoiceId'>) =>
  JSON.stringify([i.supplierId, i.supplierName, i.supplierAddress, i.invoiceDate, i.amount, i.lines.map((l) => [l.description, l.qty, l.unitPrice])])

export function isStaleSeed(stored: readonly Stored[], seed: readonly Invoice[]): boolean {
  if (stored.length !== seed.length) return true
  const expected = new Map(seed.map((i) => [i.id, fixedFacts(i)]))
  return stored.some((doc) => expected.get(doc.invoiceId) !== fixedFacts(doc))
}
