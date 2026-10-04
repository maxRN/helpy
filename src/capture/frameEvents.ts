// Screenshots → screen events for the voice agent.
// A tiny thumbnail diff decides whether the screen changed; only changed frames go to /api/frame (Haiku).
// One request at a time, latest wins: while one frame is being described, only the newest changed frame
// waits (no backlog of obsolete screenshots, and no change is lost because a request was in flight).
// Vision events that repeat an ERP click event (±3 s) are marked as confirmations, not sent twice.
import { emitEvent, getEventLog } from '../shared/bus'
import { businessFacts, scrubUngroundedInvoices } from '../shared/grounding'
import { markScreenChanged, noteVisionScreen, resetScreen } from '../shared/screen'
import { session } from '../shared/session'
import type { AppEvent } from '../shared/types'

// Large enough that a changed field value (a few words of 13-15 px text) still shows: at 64 x 36 the text
// was averaged away and value changes were never sent to vision. The diff stays cheap (57,600 pixels).
export const THUMB_W = 320
export const THUMB_H = 180
const PIXEL_DELTA = 24 // per channel, out of 255
// 0.05 % = 29 thumbnail pixels. A changed field value on a 1920 px screen (13 px text, ~220 px wide, so a
// 37 x 2 box here) changes 40-70; a cursor (~6), a caret or the clock's digit (1-3), Helpy blinking (~12) less.
export const CHANGE_RATIO = 0.0005
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

/**
 * Runs `work` for one item at a time. Items pushed while it runs replace each other: only the newest
 * one runs next, the ones in between are dropped (they are obsolete by then).
 */
export function latestWins<T>(work: (item: T) => Promise<void>) {
  let queued: { item: T } | null = null
  let running = false
  async function drain() {
    running = true
    try {
      while (queued) {
        const { item } = queued
        queued = null
        await work(item).catch((err: unknown) => console.warn('[frame]', err))
      }
    } finally {
      running = false
    }
  }
  return {
    push(item: T) {
      queued = { item }
      if (!running) void drain()
    },
    clear() {
      queued = null
    },
    busy: () => running || queued !== null,
  }
}

interface Frame {
  blob: Blob
  capturedAt: number
  offsetMs: number
  sessionId: string
}

let previousThumb: Uint8ClampedArray | null = null
let previousDescription = ''
let previousOffset = -1

const describer = latestWins(describe)

export function resetFrameEvents() {
  previousThumb = null
  previousDescription = ''
  previousOffset = -1
  describer.clear()
  resetScreen()
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

/** Sends one changed frame to the vision model and turns its answer into screen events. */
async function describe(frame: Frame): Promise<void> {
  if (session().sessionId !== frame.sessionId || session().offRecord) return
  const bitmap = await createImageBitmap(frame.blob)
  let image: string
  try {
    image = await toBase64Jpeg(bitmap)
  } finally {
    bitmap.close()
  }
  const res = await fetch('/api/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, previous: previousDescription }),
  })
  if (!res.ok) throw new Error(`/api/frame ${res.status}`)
  const body = (await res.json()) as { description: string; events: { kind: AppEvent['kind']; invoiceId: string; text: string }[] }
  if (session().sessionId !== frame.sessionId) return
  // Only invoices that exist in the app: a misread or invented number is never passed on.
  const known = businessFacts().invoiceIds
  previousDescription = scrubUngroundedInvoices(body.description, known)
  noteVisionScreen(previousDescription, frame.capturedAt)
  for (const ev of body.events) {
    const grounded = !ev.invoiceId || !known.length || known.includes(ev.invoiceId)
    if (!grounded) console.warn('[frame] vision named an invoice that does not exist:', ev.invoiceId)
    const invoiceId = grounded ? ev.invoiceId : ''
    const dom = matchingDomEvent(getEventLog(), ev.kind, invoiceId, frame.offsetMs)
    emitEvent({
      source: 'vision',
      kind: ev.kind,
      t: frame.offsetMs,
      invoiceId: invoiceId || undefined,
      text: scrubUngroundedInvoices(ev.text, known),
      meta: { ...(dom ? { confirms: dom.id } : {}), capturedAt: frame.capturedAt, ...(grounded ? {} : { ungroundedInvoiceId: ev.invoiceId }) },
    })
  }
}

/** Call with every (already PII-masked) screenshot. */
export async function processFrame(blob: Blob, capturedAt: number, offsetMs: number): Promise<void> {
  const sessionId = session().sessionId
  const bitmap = await createImageBitmap(blob)
  try {
    if (session().sessionId !== sessionId || offsetMs <= previousOffset) return
    previousOffset = offsetMs
    const { ctx } = canvas(THUMB_W, THUMB_H)
    ctx.drawImage(bitmap, 0, 0, THUMB_W, THUMB_H)
    const thumb = ctx.getImageData(0, 0, THUMB_W, THUMB_H).data
    const changed = !previousThumb || changedRatio(previousThumb, thumb) >= CHANGE_RATIO
    previousThumb = thumb
    if (!changed || session().offRecord) return
    markScreenChanged(capturedAt)
    describer.push({ blob, capturedAt, offsetMs, sessionId })
  } finally {
    bitmap.close()
  }
}
