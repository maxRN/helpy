import { describe, expect, it } from 'vitest'
import { ALL_INVOICES } from './seed'
import { isStaleSeed } from './seedVersion'

const stored = () => ALL_INVOICES.map(({ id, ...rest }) => ({ invoiceId: id, ...structuredClone(rest) }))

describe('isStaleSeed', () => {
  it('a ledger from the current seed is not stale, also after work was done in it', () => {
    const docs = stored()
    docs[0]!.status = 'posted'
    docs[0]!.costCenter = '0400'
    docs[0]!.note = 'checked'
    expect(isStaleSeed(docs, ALL_INVOICES)).toBe(false)
  })

  it('a ledger from an older seed (other dates, suppliers or invoices) is stale', () => {
    const oldDate = stored()
    oldDate[0]!.invoiceDate = '2025-12-18'
    expect(isStaleSeed(oldDate, ALL_INVOICES)).toBe(true)

    const oldSupplier = stored()
    oldSupplier[1]!.supplierName = 'Kramer Industrial Supply'
    expect(isStaleSeed(oldSupplier, ALL_INVOICES)).toBe(true)

    expect(isStaleSeed(stored().slice(1), ALL_INVOICES)).toBe(true)
  })
})

describe('demo dates', () => {
  it('every invoice is from August to October 2026 and not after the business date', () => {
    for (const i of ALL_INVOICES) {
      expect(i.invoiceDate >= '2026-08-01' && i.invoiceDate <= '2026-10-04', `${i.id} ${i.invoiceDate}`).toBe(true)
    }
  })

  it('amounts are in euros on the canonical story: 4471 €6,800, teach case 5102 €7,200, 5105 €1,900', () => {
    const amount = (id: string) => ALL_INVOICES.find((i) => i.id === id)!.amount
    expect([amount('4471'), amount('5102'), amount('5105')]).toEqual([6800, 7200, 1900])
  })
})
