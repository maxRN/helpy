import { analyzeScreenshot } from './ocr'
import type { OcrResult } from './ocr-contract'
import { detectPii } from './pii'
import { paintSyntheticPii, syntheticPii } from './synthetic-pii'

type Span = { start: number; end: number; label: string }

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
  const { items } = await detectPii(text)
  const detected = performance.now()
  const spans: Span[] = items.map(({ start, end, label, original }) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || text.slice(start, end) !== original) {
      throw new Error('PII redaction returned invalid text offsets.')
    }
    if (!regions.some((region) => region.start < end && region.end > start)) throw new Error('PII text has no screenshot coordinates.')
    return { start, end, label }
  })
  const edits = new Map<typeof regions[number], { start: number; end: number; text: string }[]>()
  let redactedText = text
  for (const span of [...spans].reverse()) {
    const replacement = syntheticPii(span.label)
    redactedText = redactedText.slice(0, span.start) + replacement + redactedText.slice(span.end)
    const words = replacement.split(' ')
    const matched = regions.filter(({ start, end }) => start < span.end && end > span.start)
    matched.forEach((region, index) => {
      const value = words.slice(Math.ceil(index * words.length / matched.length), Math.ceil((index + 1) * words.length / matched.length)).join(' ')
      const changes = edits.get(region) ?? []
      changes.push({ start: Math.max(0, span.start - region.start), end: Math.min(region.region.text.length, span.end - region.start), text: value })
      edits.set(region, changes)
    })
  }
  const replacements = regions.flatMap((region) => {
    const changes = edits.get(region)
    if (!changes) return []
    let value = region.region.text
    for (const change of changes) value = value.slice(0, change.start) + change.text + value.slice(change.end)
    return [{ box: region.region.bbox, text: value }]
  })
  const image = await createImageBitmap(original)
  const boxes = replacements.map(({ box }) => box)
  let redacted: Blob
  try {
    if (!boxes.length) redacted = original
    else {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser cannot paint screenshot redactions.')
      context.drawImage(image, 0, 0)
      paintSyntheticPii(context, replacements)
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

const lanes = [Promise.resolve(), Promise.resolve()]
let nextLane = 0
let pending = 0

export function processScreenshot(original: Blob) {
  if (pending >= 30) return Promise.reject(new Error('Screenshot processing cannot keep up. Recording stopped to finish the queued screenshots.'))
  pending++
  const lane = nextLane++ % lanes.length
  const job = lanes[lane].then(() => process(original)).finally(() => { pending-- })
  lanes[lane] = job.then(() => undefined, () => undefined)
  return job
}
