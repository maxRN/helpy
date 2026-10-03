// Screenshots → screen events for the voice agent.
// A tiny thumbnail diff decides whether the screen changed; only changed frames go to /api/frame (Haiku).
// Vision events that repeat an ERP click event (±3 s) are marked as confirmations, not sent twice.
import { emitEvent, getEventLog } from '../shared/bus'
import { markFrameChange } from '../shared/frames'
import { session } from '../shared/session'
import type { AppEvent } from '../shared/types'

const THUMB_W = 64
const THUMB_H = 36
const PIXEL_DELTA = 24 // per channel, out of 255
export const CHANGE_RATIO = 0.01 // share of thumbnail pixels that must change
const MAX_WIDTH = 1280
const DOM_MATCH_MS = 3000

/** Share of pixels whose RGB differs noticeably between two RGBA thumbnails of equal size. */
export function changedRatio(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return 1
  let changed = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > PIXEL_DELTA || Math.abs(a[i + 1] - b[i + 1]) > PIXEL_DELTA || Math.abs(a[i + 2] - b[i + 2]) > PIXEL_DELTA) {
      changed++
    }
  }
  return changed / (a.length / 4)
}

/** The ERP click event a vision event repeats, if any. */
export function matchingDomEvent(log: readonly AppEvent[], kind: AppEvent['kind'], invoiceId: string, t: number): AppEvent | undefined {
  return log.find(
    (e) => e.source === 'dom' && e.kind === kind && (!invoiceId || e.invoiceId === invoiceId) && Math.abs(e.t - t) <= DOM_MATCH_MS,
  )
}

let previousThumb: Uint8ClampedArray | null = null
let previousDescription = ''
let inFlight = false

export function resetFrameEvents() {
  previousThumb = null
  previousDescription = ''
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  return { c, ctx }
}

async function toBase64Jpeg(bitmap: ImageBitmap): Promise<string> {
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const { c, ctx } = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.7))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Call with every (already PII-masked) screenshot. */
export async function processFrame(blob: Blob, capturedAt: number, offsetMs: number): Promise<void> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { ctx } = canvas(THUMB_W, THUMB_H)
    ctx.drawImage(bitmap, 0, 0, THUMB_W, THUMB_H)
    const thumb = ctx.getImageData(0, 0, THUMB_W, THUMB_H).data
    const changed = !previousThumb || changedRatio(previousThumb, thumb) >= CHANGE_RATIO
    previousThumb = thumb
    if (!changed) return
    markFrameChange(capturedAt)

    // One request at a time; skipped frames are fine, the next change is described relative to the last one.
    if (inFlight || session().offRecord) return
    inFlight = true
    try {
      const res = await fetch('/api/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: await toBase64Jpeg(bitmap), previous: previousDescription }),
      })
      if (!res.ok) throw new Error(`/api/frame ${res.status}`)
      const body = (await res.json()) as { description: string; events: { kind: AppEvent['kind']; invoiceId: string; text: string }[] }
      previousDescription = body.description
      for (const ev of body.events) {
        const dom = matchingDomEvent(getEventLog(), ev.kind, ev.invoiceId, offsetMs)
        emitEvent({
          source: 'vision',
          kind: ev.kind,
          t: offsetMs,
          invoiceId: ev.invoiceId || undefined,
          text: ev.text,
          meta: dom ? { confirms: dom.id } : {},
        })
      }
    } finally {
      inFlight = false
    }
  } finally {
    bitmap.close()
  }
}
