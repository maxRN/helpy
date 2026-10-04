import { describe, expect, it } from 'vitest'
import { invoiceRefs, scrubUngroundedInvoices, termOccurrences, ungroundedInvoiceRefs, withoutBusinessTerms } from './grounding'

const span = (text: string, original: string, label: string, from = 0) => {
  const start = text.indexOf(original, from)
  return { start, end: start + original.length, label }
}

describe('business identifiers are not redacted', () => {
  // What the Redact model really returned for this screen text (checked in the browser): the invoice
  // number as BUILDING_NUMBER, so the screenshot showed the synthetic "42" instead of "4472".
  const text = 'Invoice 4472 Kramer Industrial Supply 415 Foundry St Contact: Greg Kramer No. 4472 Cost center 4711'
  const spans = [
    span(text, '4472', 'BUILDING_NUMBER'),
    span(text, '415', 'BUILDING_NUMBER'),
    span(text, 'Foundry St', 'STREET_NAME'),
    span(text, 'Greg', 'GIVEN_NAME'),
    span(text, 'Kramer', 'SURNAME', text.indexOf('Greg')),
    span(text, '4472', 'BUILDING_NUMBER', text.indexOf('No.')),
    span(text, '4711', 'ZIP_CODE'),
  ]
  const terms = ['4472', '4711', 'Kramer Industrial Supply']

  it('keeps invoice numbers and cost centers, still redacts the address and the person', () => {
    const kept = withoutBusinessTerms(text, spans, terms).map((s) => text.slice(s.start, s.end))
    expect(kept).toEqual(['415', 'Foundry St', 'Greg', 'Kramer'])
  })

  it('matches whole tokens only: a number inside a longer number is not a business term', () => {
    expect(termOccurrences('PLZ 44721 Dortmund', '4472')).toEqual([])
    expect(termOccurrences('Invoice 4472.', '4472')).toEqual([[8, 12]])
  })

  it('matches names across OCR line breaks', () => {
    expect(termOccurrences('Kramer Industrial\nSupply GmbH', 'Kramer Industrial Supply')).toEqual([[0, 24]])
  })
})

describe('invoice grounding', () => {
  const known = ['4471', '4472', '4473']

  it('finds invoice references in English and German', () => {
    expect(invoiceRefs('You held invoice 4472. Why that one?')).toEqual(['4472'])
    expect(invoiceRefs('Invoice No. 4471 and invoice #4473')).toEqual(['4471', '4473'])
    expect(invoiceRefs('Warum hast du Rechnung Nr. 4473 gehalten?')).toEqual(['4473'])
    expect(invoiceRefs('Cost center 4711 is opex.')).toEqual([])
  })

  it('reports invoice numbers the app does not know, whatever the number', () => {
    expect(ungroundedInvoiceRefs('You held invoice 42. Why?', known)).toEqual(['42'])
    expect(ungroundedInvoiceRefs('What about invoice 9999?', known)).toEqual(['9999'])
    expect(ungroundedInvoiceRefs('You moved invoice 4471 to capex.', known)).toEqual([])
  })

  it('cannot judge without facts, so it reports nothing', () => {
    expect(ungroundedInvoiceRefs('invoice 42', [])).toEqual([])
  })

  it('scrubs unknown invoice numbers and keeps known ones', () => {
    expect(scrubUngroundedInvoices('Invoice 42: cost center changed. Invoice 4471 open.', known)).toBe(
      'an invoice (number not readable): cost center changed. Invoice 4471 open.',
    )
  })
})
