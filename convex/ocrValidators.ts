import { v } from 'convex/values'
import { TESSERACT_MODEL, TESSERACT_REVISION, OCR_LANGUAGE } from '../src/capture/ocr-contract'

const tesseractResult = v.object({
  model: v.literal(TESSERACT_MODEL),
  revision: v.literal(TESSERACT_REVISION),
  language: v.literal(OCR_LANGUAGE),
  width: v.number(),
  height: v.number(),
  text: v.string(),
  regions: v.array(v.object({
    text: v.string(),
    confidence: v.number(),
    bbox: v.object({ x0: v.number(), y0: v.number(), x1: v.number(), y1: v.number() }),
  })),
})

export const ocrResult = v.union(tesseractResult, v.object({
  model: v.literal('onnx-community/Florence-2-base-ft'),
  revision: v.literal('e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f'),
  width: v.number(),
  height: v.number(),
  regions: v.array(v.object({ text: v.string(), quad: v.array(v.number()) })),
}), v.object({
  model: v.literal('HuggingFaceTB/SmolVLM-500M-Instruct'),
  revision: v.literal('a7da5b986cb59b408707209984f360a5f4ad7e47'),
  width: v.number(),
  height: v.number(),
  text: v.string(),
}))
export const screenshotAnnotation = v.union(
  v.object({ kind: v.literal('completed'), result: ocrResult }),
  v.object({ kind: v.literal('failed'), error: v.string() }),
)
export const screenshotOcr = v.union(v.object({ kind: v.literal('pending') }), screenshotAnnotation)

export const screenshotRedaction = v.object({
  model: v.literal('desert-ant-labs/redact'),
  revision: v.literal('v0.4.0'),
  text: v.string(),
  spans: v.array(v.object({ start: v.number(), end: v.number(), label: v.string() })),
  boxes: v.array(v.object({ x0: v.number(), y0: v.number(), x1: v.number(), y1: v.number() })),
  timings: v.object({ ocrMs: v.number(), piiMs: v.number(), maskMs: v.number(), totalMs: v.number(), uploadMs: v.number() }),
})

export const screenshotProcessing = v.union(
  v.object({ kind: v.literal('pending') }),
  v.object({ kind: v.literal('completed'), result: tesseractResult, redactedStorageId: v.string(), redaction: screenshotRedaction }),
  v.object({ kind: v.literal('failed'), error: v.string() }),
)
