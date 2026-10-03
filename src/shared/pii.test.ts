import { describe, expect, it } from 'vitest'
import { PII_PADDING, toVideoRects, type WindowGeometry } from './pii'

// Maximized Chrome on a 1920×1080 monitor at 150% scaling: 1280×720 CSS px, captured at 1920 px wide.
const maximized: WindowGeometry = {
  screenX: 0,
  screenY: 0,
  outerWidth: 1280,
  outerHeight: 680,
  innerWidth: 1280,
  innerHeight: 600, // 80 px of tabs and address bar
  screenWidth: 1280,
  screenLeft: 0,
  screenTop: 0,
}

describe('toVideoRects', () => {
  it('maps a page rect into monitor pixels, below the browser chrome, with padding', () => {
    const [r] = toVideoRects([{ x: 100, y: 50, w: 200, h: 20 }], maximized, 1920)
    const scale = 1.5
    expect(r).toEqual({
      x: Math.floor((100 - PII_PADDING) * scale),
      y: Math.floor((80 + 50 - PII_PADDING) * scale),
      w: Math.ceil((200 + 2 * PII_PADDING) * scale),
      h: Math.ceil((20 + 2 * PII_PADDING) * scale),
    })
  })

  it('accounts for a window on a second monitor', () => {
    const second = { ...maximized, screenX: 1280, screenLeft: 1280 }
    expect(toVideoRects([{ x: 100, y: 50, w: 10, h: 10 }], second, 1920)).toEqual(
      toVideoRects([{ x: 100, y: 50, w: 10, h: 10 }], maximized, 1920),
    )
  })

  it('accounts for a non-maximized window with side borders', () => {
    const windowed = { ...maximized, screenX: 200, screenY: 100, outerWidth: 1016, innerWidth: 1000, outerHeight: 700, innerHeight: 612 }
    const [r] = toVideoRects([{ x: 0, y: 0, w: 10, h: 10 }], windowed, 1280)
    // viewport starts at x = 200 + 8 (border), y = 100 + 88 - 8
    expect(r.x).toBe(208 - PII_PADDING)
    expect(r.y).toBe(180 - PII_PADDING)
  })
})
