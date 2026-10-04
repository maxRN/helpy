import { describe, expect, it } from 'vitest'
import { conciseProcessName, PROCESS_NAME_MAX } from './processName'

const words = (s: string) => s.split(' ').length

describe('conciseProcessName', () => {
  it('keeps short, good names as they are (title case)', () => {
    expect(conciseProcessName('Approve supplier invoice')).toBe('Approve Supplier Invoice')
    expect(conciseProcessName('Handle December Duplicates')).toBe('Handle December Duplicates')
    expect(conciseProcessName('code equipment invoice.')).toBe('Code Equipment Invoice')
  })

  it('drops "Process for", "How I" and similar lead-ins', () => {
    expect(conciseProcessName('Process for approving supplier invoices')).toBe('Approving Supplier Invoices')
    expect(conciseProcessName('How I code an equipment invoice')).toBe('Code Equipment Invoice')
    expect(conciseProcessName('Ich zeige dir, wie ich Lieferantenrechnungen prüfe')).toBe('Lieferantenrechnungen Prüfe')
  })

  it('cuts off explanations and transcript fragments', () => {
    expect(conciseProcessName('Hold Kramer invoices at quarter-end, because they bill us twice and Weber releases them')).toBe('Hold Kramer Invoices at Quarter-end')
    expect(conciseProcessName('Code equipment invoices - anything over 5,000 goes to capex')).toBe('Code Equipment Invoices')
  })

  it('a verbose model output never becomes a huge title', () => {
    const long = 'Process supplier invoices before the September month-end close including capex coding, holds and second approvals for intercompany'
    const t = conciseProcessName(long)
    expect(t.length).toBeLessThanOrEqual(PROCESS_NAME_MAX)
    expect(words(t)).toBeLessThanOrEqual(5)
    expect(t).toBe('Process Supplier Invoices before September')
  })

  it('never ends on a small word and respects the hard cap with long words', () => {
    expect(conciseProcessName('Pay invoices for the')).toBe('Pay Invoices')
    const t = conciseProcessName('Lieferantenrechnungsprüfungsverfahrensbeschreibung Kreditorenbuchhaltung')
    expect(t.length).toBeLessThanOrEqual(PROCESS_NAME_MAX)
  })

  it('returns an empty string when nothing is left', () => {
    expect(conciseProcessName('  ')).toBe('')
    expect(conciseProcessName('“”')).toBe('')
  })
})
