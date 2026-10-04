import { analyzeScreenshot } from './ocr'
import type { OcrResult } from './ocr-contract'
import { detectPii } from './pii'

type Span = { start: number; end: number; label: string }
type Box = { x0: number; y0: number; x1: number; y1: number }

function textPositions(result: OcrResult) {
  const text = result.text
  let cursor = 0
  const regions = result.regions.map((region) => {
    const start = text.indexOf(region.text, cursor)
    if (start < 0) throw new Error('OCR text does not match its word coordinates.')
    const end = start + region.text.length
    cursor = end
    return { region, start, end }
  })
  return { text, regions }
}

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the redacted screenshot.')), type, 0.85))
}

export async function redactScreenshot({ original, ocr }: { original: Blob; ocr: OcrResult }) {
  const started = performance.now()
  const { text, regions } = textPositions(ocr)
  const { redactedText, items } = await detectPii(text)
  const detected = performance.now()
  const spans: Span[] = items.map(({ start, end, label, original }) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || text.slice(start, end) !== original) {
      throw new Error('PII redaction returned invalid text offsets.')
    }
    if (!regions.some((region) => region.start < end && region.end > start)) throw new Error('PII text has no screenshot coordinates.')
    return { start, end, label }
  })
  const image = await createImageBitmap(original)
  const boxes: Box[] = []
  let redacted: Blob
  try {
    for (const { region, start, end } of regions) {
      if (spans.some((span) => span.start < end && span.end > start)) boxes.push(region.bbox)
    }
    if (!boxes.length) redacted = original
    else {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser cannot paint screenshot redactions.')
      context.drawImage(image, 0, 0)
      context.fillStyle = '#000'
      for (const box of boxes) context.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      redacted = await encode(canvas, 'image/png')
    }
  } finally { image.close() }
  const finished = performance.now()
  return { redacted, redaction: {
    model: 'desert-ant-labs/redact' as const, revision: 'v0.4.0' as const,
    text: redactedText, spans, boxes,
    timings: { piiMs: detected - started, maskMs: finished - detected },
  } }
}

async function process(original: Blob) {
  const started = performance.now()
  const ocr = await analyzeScreenshot(original)
  const recognized = performance.now()
  const { redacted, redaction } = await redactScreenshot({ original, ocr })
  return { original, redacted, ocr, redaction: { ...redaction, timings: {
    ocrMs: recognized - started, ...redaction.timings, totalMs: performance.now() - started,
  } } }
}

let queue = Promise.resolve()
let pending = 0

export function processScreenshot(original: Blob) {
  if (pending >= 30) return Promise.reject(new Error('Screenshot processing cannot keep up. Recording stopped to finish the queued screenshots.'))
  pending++
  const job = queue.then(() => process(original)).finally(() => { pending-- })
  queue = job.then(() => undefined, () => undefined)
  return job
}
