import { analyzeScreenshot } from './ocr'
import { TESSERACT_MODEL } from './ocr-contract'
import type { OcrResult } from './ocr-contract'
import { detectPii } from './pii'
import { loadTesseract, recognizeTesseract } from './tesseract'

type Span = { start: number; end: number; label: string }
type Box = { x0: number; y0: number; x1: number; y1: number }
let wordModel: ReturnType<typeof loadTesseract> | undefined

function textPositions(result: OcrResult) {
  const text = result.model === TESSERACT_MODEL ? result.text : result.regions.map((region) => region.text).join('\n')
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

function bounds(region: OcrResult['regions'][number]): Box {
  if ('bbox' in region) return region.bbox
  const [x0, y0, x1, y1, x2, y2, x3, y3] = region.quad
  return { x0: Math.floor(Math.min(x0, x1, x2, x3)), y0: Math.floor(Math.min(y0, y1, y2, y3)), x1: Math.ceil(Math.max(x0, x1, x2, x3)), y1: Math.ceil(Math.max(y0, y1, y2, y3)) }
}

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the redacted screenshot.')), type, 0.85))
}

async function locateWords(image: ImageBitmap, box: Box, sensitiveText: string[]): Promise<Box[]> {
  const crop = document.createElement('canvas')
  crop.width = box.x1 - box.x0
  crop.height = box.y1 - box.y0
  const context = crop.getContext('2d')
  if (!context) throw new Error('This browser cannot locate redacted words.')
  context.drawImage(image, box.x0, box.y0, crop.width, crop.height, 0, 0, crop.width, crop.height)
  wordModel ??= loadTesseract((state) => { if (state.kind === 'failed') wordModel = undefined })
  const result = await recognizeTesseract(await wordModel, await encode(crop, 'image/png'))
  let text = ''
  const words = result.regions.map((region) => {
    const start = text.length
    text += region.text.replace(/\s/g, '')
    return { start, end: text.length, box: region.bbox }
  })
  const selected = new Set<Box>()
  for (const sensitive of sensitiveText) {
    const needle = sensitive.replace(/\s/g, '')
    let start = text.indexOf(needle)
    if (!needle || start < 0) throw new Error('Could not locate the PII words inside a Florence text region. The screenshot was not saved as redacted.')
    while (start >= 0) {
      for (const word of words) if (word.start < start + needle.length && word.end > start) selected.add(word.box)
      start = text.indexOf(needle, start + needle.length)
    }
  }
  return [...selected].map((word) => ({ x0: box.x0 + word.x0, y0: box.y0 + word.y0, x1: box.x0 + word.x1, y1: box.y0 + word.y1 }))
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
      const hits = spans.filter((span) => span.start < end && span.end > start)
      if (!hits.length) continue
      const box = bounds(region)
      if ('bbox' in region || hits.some((hit) => hit.start <= start && hit.end >= end)) boxes.push(box)
      else boxes.push(...await locateWords(image, box, hits.map((hit) => text.slice(Math.max(start, hit.start), Math.min(end, hit.end)))))
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
