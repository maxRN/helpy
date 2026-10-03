import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../shared/types'
import { CHANGE_RATIO, changedRatio, matchingDomEvent } from './frameEvents'

const thumb = (pixels: number, value = 0) => new Uint8ClampedArray(pixels * 4).fill(value)

describe('changedRatio', () => {
  it('is 0 for identical frames and ignores small noise', () => {
    const a = thumb(100, 100)
    const b = thumb(100, 110) // +10 per channel: compression noise
    expect(changedRatio(a, a)).toBe(0)
    expect(changedRatio(a, b)).toBe(0)
  })

  it('counts pixels with a visible change', () => {
    const a = thumb(100, 100)
    const b = a.slice()
    for (let i = 0; i < 5 * 4; i += 4) b[i] = 200 // 5 of 100 pixels changed
    expect(changedRatio(a, b)).toBeCloseTo(0.05)
    expect(changedRatio(a, b) >= CHANGE_RATIO).toBe(true)
  })
})

describe('matchingDomEvent', () => {
  const log: AppEvent[] = [
    { id: 'd1', t: 10_000, source: 'dom', kind: 'field_changed', invoiceId: '4471' },
    { id: 'd2', t: 30_000, source: 'dom', kind: 'action', invoiceId: '4472' },
  ]

  it('finds the ERP event a vision event repeats', () => {
    expect(matchingDomEvent(log, 'field_changed', '4471', 12_000)?.id).toBe('d1')
  })

  it('does not match other invoices, other kinds or events far apart in time', () => {
    expect(matchingDomEvent(log, 'field_changed', '4472', 10_000)).toBeUndefined()
    expect(matchingDomEvent(log, 'action', '4471', 10_000)).toBeUndefined()
    expect(matchingDomEvent(log, 'field_changed', '4471', 20_000)).toBeUndefined()
  })
})
