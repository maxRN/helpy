import { v } from 'convex/values'
import { OCR_MODEL, OCR_REVISION } from '../src/capture/ocr-contract'

export const ocrResult = v.object({
  model: v.literal(OCR_MODEL),
  revision: v.literal(OCR_REVISION),
  width: v.number(),
  height: v.number(),
  regions: v.array(v.object({ text: v.string(), quad: v.array(v.number()) })),
})
export const screenshotAnnotation = v.union(
  v.object({ kind: v.literal('completed'), result: ocrResult }),
  v.object({ kind: v.literal('failed'), error: v.string() }),
)
export const screenshotOcr = v.union(v.object({ kind: v.literal('pending') }), screenshotAnnotation)
