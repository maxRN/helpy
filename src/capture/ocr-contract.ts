import { z } from 'zod'

export const OCR_MODEL = 'onnx-community/Florence-2-base-ft'
export const OCR_REVISION = 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f'
export const SMOLVLM_MODEL = 'HuggingFaceTB/SmolVLM-500M-Instruct'
export const SMOLVLM_REVISION = 'a7da5b986cb59b408707209984f360a5f4ad7e47'
export const TESSERACT_MODEL = 'tesseract.js'
export const TESSERACT_REVISION = '7.0.0'
export const OCR_LANGUAGE = 'eng+deu'
export const OCR_TASK = '<OCR_WITH_REGION>'
export const OCR_MODELS = {
  florence: { label: 'Florence-2-base-ft', model: OCR_MODEL, revision: OCR_REVISION, cache: 'sabine-florence-2-v1' },
  tesseract: { label: 'Tesseract.js', model: TESSERACT_MODEL, revision: TESSERACT_REVISION },
}
export const ocrModelIdSchema = z.enum(['florence', 'tesseract'])
export type OcrModelId = z.infer<typeof ocrModelIdSchema>

const coordinate = z.number().finite().nonnegative()
export const quadSchema = z.tuple([coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate])
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
export const tesseractResultSchema = z.object({
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

export const ocrResultSchema = z.discriminatedUnion('model', [tesseractResultSchema, z.object({
  model: z.literal(OCR_MODEL),
  revision: z.literal(OCR_REVISION),
  ...dimensions,
  regions: z.array(z.object({ text: z.string(), quad: quadSchema })),
})]).superRefine((result, context) => {
  if (result.model !== OCR_MODEL) return
  for (const region of result.regions) {
    if (region.quad.some((value, index) => value > (index % 2 === 0 ? result.width : result.height))) {
      context.addIssue({ code: 'custom', message: 'Text position exceeds screenshot dimensions.' })
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

export type OcrRequest = { kind: 'load'; modelId: OcrModelId } | { kind: 'analyze'; id: number; blob: Blob }
export const ocrResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('state'), state: modelStateSchema }),
  z.object({ kind: z.literal('result'), id: z.number(), result: ocrResultSchema }),
  z.object({ kind: z.literal('error'), id: z.number(), error: z.string() }),
])
export type OcrResponse = z.infer<typeof ocrResponseSchema>
