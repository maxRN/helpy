import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../shared/types'
import { CHANGE_RATIO, changedRatio, latestWins, matchingDomEvent, THUMB_H, THUMB_W } from './frameEvents'

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

describe('change detection thresholds', () => {
  // A white 320 x 180 thumbnail with dark "text" blocks: a stand-in for a screen scaled down 1/6.
  const screen = (draw: (put: (x: number, y: number) => void) => void) => {
    const px = new Uint8ClampedArray(THUMB_W * THUMB_H * 4).fill(255)
    draw((x, y) => px.fill(30, (y * THUMB_W + x) * 4, (y * THUMB_W + x) * 4 + 3))
    return px
  }
  // Text as a pattern of dark pixels; other glyphs = another pattern in the same box.
  const text = (x0: number, y0: number, w: number, h: number, glyphs: number) => (put: (x: number, y: number) => void) => {
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) if ((x + y + glyphs) % 2 === 0) put(x, y)
  }

  it('a changed field value counts as a change (13 px text on a 1920 px screen: a 37 x 2 box at 1/6)', () => {
    const before = screen(text(100, 60, 37, 2, 0)) // "4711 – Production – Maintenance"
    const after = screen(text(100, 60, 37, 2, 1)) // "0400 – Capital Equipment"
    expect(changedRatio(before, after)).toBeGreaterThanOrEqual(CHANGE_RATIO)
  })

  it('a moving mouse cursor or a blinking caret does not', () => {
    const base = screen(text(100, 60, 37, 2, 0))
    const cursor = screen((put) => {
      text(100, 60, 37, 2, 0)(put)
      for (let i = 0; i < 6; i++) put(200 + (i % 2), 100 + Math.floor(i / 2)) // arrow cursor, ~2 x 3
    })
    const caret = screen((put) => {
      text(100, 60, 37, 2, 0)(put)
      put(140, 60)
      put(140, 61)
    })
    expect(changedRatio(base, cursor)).toBeLessThan(CHANGE_RATIO)
    expect(changedRatio(base, caret)).toBeLessThan(CHANGE_RATIO)
  })
})

describe('latestWins', () => {
  it('runs one item at a time and skips the obsolete ones queued meanwhile', async () => {
    const ran: number[] = []
    let running = 0
    let maxRunning = 0
    const gates: Array<() => void> = []
    const q = latestWins(async (n: number) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise<void>((r) => gates.push(r))
      ran.push(n)
      running--
    })
    q.push(1) // starts at once
    q.push(2) // obsolete before it ever runs
    q.push(3) // newest: runs next
    gates.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    gates.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    expect(ran).toEqual([1, 3])
    expect(maxRunning).toBe(1)
    expect(q.busy()).toBe(false)
  })

  it('keeps going after a failed item', async () => {
    const ran: number[] = []
    const q = latestWins(async (n: number) => {
      if (n === 1) throw new Error('vision down')
      ran.push(n)
    })
    q.push(1)
    q.push(2)
    await new Promise((r) => setTimeout(r, 0))
    expect(ran).toEqual([2])
  })
})
