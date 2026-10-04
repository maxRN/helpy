// Regression: "invoice 42". The redaction model took invoice number 4472 for a building number, the
// screenshot got the synthetic "42" painted over it, and the vision model then read "Invoice 42".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { erpFacts } from '../erp/facts'
import { ALL_INVOICES } from '../erp/seed'
import { registerBusinessFacts } from '../shared/grounding'
import type { OcrResult } from './ocr-contract'

const detected: { items: { start: number; end: number; label: string; original: string }[] } = { items: [] }
vi.mock('./pii', () => ({ detectPii: async () => detected }))

const { redactScreenshot } = await import('./pipeline')

/** OCR result with one word box per word, as Tesseract returns it. */
function ocrOf(text: string): OcrResult {
  let x = 0
  const regions = text.split(' ').map((word) => {
    const box = { x0: x, y0: 0, x1: x + word.length * 8, y1: 12 }
    x += (word.length + 1) * 8
    return { text: word, confidence: 90, bbox: box }
  })
  return { text, regions } as unknown as OcrResult
}

const find = (text: string, original: string, label: string, from = 0) => {
  const start = text.indexOf(original, from)
  return { start, end: start + original.length, label, original }
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 20, close() {} }))
  registerBusinessFacts(() => erpFacts(Object.fromEntries(ALL_INVOICES.map((i) => [i.id, i]))))
})
afterEach(() => {
  registerBusinessFacts(null)
  vi.unstubAllGlobals()
})

describe('redactScreenshot', () => {
  it('never paints a synthetic value over an invoice number or cost center', async () => {
    const text = 'Invoice 4472 No. 4472 Cost center 4711'
    detected.items = [find(text, '4472', 'BUILDING_NUMBER'), find(text, '4472', 'BUILDING_NUMBER', 10), find(text, '4711', 'ZIP_CODE')]
    const original = new Blob(['jpeg'])
    const { redacted, redaction } = await redactScreenshot({ original, ocr: ocrOf(text) })
    expect(redaction.text).toBe(text) // nothing replaced, so no "42" and no "00000"
    expect(redaction.boxes).toEqual([])
    expect(redacted).toBe(original)
  })
})
