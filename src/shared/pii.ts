// Masks personal data ([data-pii] elements) in screenshots before they are stored or sent to a model.
// Capture records the whole monitor, so element positions are mapped from page coordinates to
// monitor pixels. The mapping is approximate (browser chrome sizes vary), hence the generous padding.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface WindowGeometry {
  screenX: number // window position on the virtual desktop (CSS px)
  screenY: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  screenWidth: number // width of the monitor the window is on (CSS px)
  screenLeft: number // left edge of that monitor on the virtual desktop (CSS px)
  screenTop: number
}

export const PII_PADDING = 10 // CSS px around each element

/** Page rects (from getBoundingClientRect) → rects in captured-video pixels. */
export function toVideoRects(pageRects: Rect[], g: WindowGeometry, videoWidth: number): Rect[] {
  const scale = videoWidth / g.screenWidth
  const border = Math.max(0, (g.outerWidth - g.innerWidth) / 2) // side window border
  const viewportLeft = g.screenX - g.screenLeft + border
  const viewportTop = g.screenY - g.screenTop + (g.outerHeight - g.innerHeight) - border // tabs, address bar
  return pageRects.map((r) => ({
    x: Math.floor((viewportLeft + r.x - PII_PADDING) * scale),
    y: Math.floor((viewportTop + r.y - PII_PADDING) * scale),
    w: Math.ceil((r.w + 2 * PII_PADDING) * scale),
    h: Math.ceil((r.h + 2 * PII_PADDING) * scale),
  }))
}

/** Blacks out every visible [data-pii] element of this page on a captured frame. */
export function maskPii(ctx: CanvasRenderingContext2D, videoWidth: number) {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return // our page is not on screen
  const pageRects = [...document.querySelectorAll<HTMLElement>('[data-pii]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight)
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }))
  if (pageRects.length === 0) return
  const s = window.screen as Screen & { availLeft?: number; availTop?: number }
  const rects = toVideoRects(
    pageRects,
    {
      screenX: window.screenX,
      screenY: window.screenY,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: s.width,
      screenLeft: s.availLeft ?? 0,
      screenTop: s.availTop ?? 0,
    },
    videoWidth,
  )
  ctx.save()
  ctx.fillStyle = '#000'
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.restore()
}
