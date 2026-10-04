import { z } from 'zod'

export const TESSERACT_MODEL = 'tesseract.js'
export const TESSERACT_REVISION = '7.0.0'
export const OCR_LANGUAGE = 'eng+deu'

const coordinate = z.number().finite().nonnegative()
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
export const ocrResultSchema = z.object({
  model: z.literal(TESSERACT_MODEL),
  revision: z.literal(TESSERACT_REVISION),
  language: z.literal(OCR_LANGUAGE),
  ...dimensions,
  text: z.string(),
  regions: z.array(z.object({
    text: z.string().min(1),
    confidence: z.number().finite().min(0).max(100),
    bbox: z.object({ x0: coordinate, y0: coordinate, x1: coordinate, y1: coordinate }),
  })),
}).superRefine((result, context) => {
  for (const { bbox } of result.regions) {
    if (bbox.x0 >= bbox.x1 || bbox.y0 >= bbox.y1 || bbox.x1 > result.width || bbox.y1 > result.height) {
      context.addIssue({ code: 'custom', message: 'Text bounding box is invalid or exceeds screenshot dimensions.' })
    }
  }
})

export type OcrResult = z.infer<typeof ocrResultSchema>

export const modelStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('loading'), message: z.string(), progress: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('failed'), error: z.string() }),
])
export type ModelState = z.infer<typeof modelStateSchema>

export type OcrRequest = { kind: 'load' } | { kind: 'analyze'; id: number; blob: Blob }
export const ocrResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('state'), state: modelStateSchema }),
  z.object({ kind: z.literal('result'), id: z.number(), result: ocrResultSchema }),
  z.object({ kind: z.literal('error'), id: z.number(), error: z.string() }),
])
export type OcrResponse = z.infer<typeof ocrResponseSchema>
