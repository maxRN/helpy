import { describe, expect, it } from 'vitest'
import { redactText, withoutOffRecord } from './privacy'
import type { AppEvent } from './types'

describe('off the record', () => {
  it('drops everything between off and back on the record, keeping the markers', () => {
    const ev = (t: number, kind: AppEvent['kind'], text?: string) => ({ id: String(t), t, source: 'dom' as const, kind, text })
    const events = [
      ev(1, 'field_changed', 'before'),
      ev(2, 'off_record_start'),
      ev(3, 'field_changed', 'private change'),
      ev(4, 'utterance', 'my salary is…'),
      ev(5, 'off_record_end'),
      ev(6, 'action', 'after'),
    ]
    expect(withoutOffRecord(events).map((e) => e.text ?? e.kind)).toEqual(['before', 'off_record_start', 'off_record_end', 'after'])
  })
})

describe('redactText', () => {
  it('replaces personal data in speech', () => {
    expect(redactText('Mail it to sabine.brandt@hartmann.de please')).toBe('Mail it to [email] please')
    expect(redactText('The IBAN is DE89 3704 0044 0532 0130 00')).toBe('The IBAN is [IBAN]')
    expect(redactText('Call me on +49 711 123 4567 or 0711/1234567')).toBe('Call me on [phone] or [phone]')
    expect(redactText('Card 4111 1111 1111 1111')).toBe('Card [card number]')
  })

  it('keeps invoice numbers, amounts, dates and cost centers', () => {
    const work = 'Invoice 4471 for €6,800.00 from 12.09.2026 goes from cost center 4711 to 0400, PO-2026-0815.'
    expect(redactText(work)).toBe(work)
  })
})
