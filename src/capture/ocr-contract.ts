import { z } from 'zod'

export const OCR_MODEL = 'onnx-community/Florence-2-base-ft'
export const OCR_REVISION = 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f'
export const OCR_TASK = '<OCR_WITH_REGION>'
export const OCR_CACHE = 'sabine-florence-2-v1'
export const SMOLVLM_MODEL = 'HuggingFaceTB/SmolVLM-500M-Instruct'
export const SMOLVLM_REVISION = 'a7da5b986cb59b408707209984f360a5f4ad7e47'
export const OCR_MODELS = {
  florence: { label: 'Florence-2-base-ft', model: OCR_MODEL, revision: OCR_REVISION, cache: OCR_CACHE },
  smolvlm: { label: 'SmolVLM-500M-Instruct', model: SMOLVLM_MODEL, revision: SMOLVLM_REVISION, cache: 'sabine-smolvlm-500m-v1' },
}
export const ocrModelIdSchema = z.enum(['florence', 'smolvlm'])
export type OcrModelId = z.infer<typeof ocrModelIdSchema>

const coordinate = z.number().finite().nonnegative()
export const quadSchema = z.tuple([coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate])
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
export const ocrResultSchema = z.discriminatedUnion('model', [z.object({
  model: z.literal(OCR_MODEL),
  revision: z.literal(OCR_REVISION),
  ...dimensions,
  regions: z.array(z.object({ text: z.string(), quad: quadSchema })),
}), z.object({
  model: z.literal(SMOLVLM_MODEL),
  revision: z.literal(SMOLVLM_REVISION),
  ...dimensions,
  text: z.string(),
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
