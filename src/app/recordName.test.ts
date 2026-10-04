import { describe, expect, it } from 'vitest'
import { titleFromAnswer } from './recordName'

describe('titleFromAnswer', () => {
  it('drops the lead-in and keeps the task', () => {
    expect(titleFromAnswer("Okay, I'm going to show you how I pay supplier invoices.")).toBe('Pay supplier invoices')
    expect(titleFromAnswer('I want to show you the month-end close')).toBe('The month-end close')
    expect(titleFromAnswer('um, how to code an invoice to a cost center')).toBe('Code an invoice to a cost center')
  })

  it('keeps a plain answer as it is', () => {
    expect(titleFromAnswer('Supplier invoices before the December close')).toBe('Supplier invoices before the December close')
  })

  it('shortens long answers at a word boundary', () => {
    const t = titleFromAnswer('checking every single supplier invoice against the purchase order and the goods receipt before posting', 40)!
    expect(t.length).toBeLessThanOrEqual(40)
    expect(t.endsWith(' ')).toBe(false)
    expect(t.startsWith('Checking every single')).toBe(true)
  })

  it('returns null when only filler was said', () => {
    expect(titleFromAnswer('Okay.')).toBeNull()
    expect(titleFromAnswer('  ')).toBeNull()
  })
})
