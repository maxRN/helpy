import { describe, expect, it } from 'vitest'
import { titleFromAnswer } from './recordName'

describe('titleFromAnswer', () => {
  it('drops the lead-in and keeps the task', () => {
    expect(titleFromAnswer("Okay, I'm going to show you how I pay supplier invoices.")).toBe('Pay Supplier Invoices')
    expect(titleFromAnswer('I want to show you the month-end close')).toBe('Month-end Close')
    expect(titleFromAnswer('um, how to code an invoice to a cost center')).toBe('Code Invoice to Cost Center')
  })

  it('keeps a short plain answer, as a title', () => {
    expect(titleFromAnswer('Supplier invoices before the quarter close')).toBe('Supplier Invoices before Quarter Close')
  })

  it('shortens long answers to a few words at a word boundary', () => {
    const t = titleFromAnswer('checking every single supplier invoice against the purchase order and the goods receipt before posting', 40)!
    expect(t.length).toBeLessThanOrEqual(40)
    expect(t.endsWith(' ')).toBe(false)
    expect(t).toBe('Checking Every Single Supplier Invoice')
  })

  it('returns null when only filler was said', () => {
    expect(titleFromAnswer('Okay.')).toBeNull()
    expect(titleFromAnswer('  ')).toBeNull()
  })
})
