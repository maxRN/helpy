import { z } from 'zod'

export const OCR_MODEL = 'onnx-community/Florence-2-base-ft'
export const OCR_REVISION = 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f'
export const OCR_TASK = '<OCR_WITH_REGION>'
export const OCR_CACHE = 'sabine-florence-2-v1'

const coordinate = z.number().finite().nonnegative()
export const quadSchema = z.tuple([coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate, coordinate])
export const ocrResultSchema = z.object({
  model: z.literal(OCR_MODEL),
  revision: z.literal(OCR_REVISION),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  regions: z.array(z.object({ text: z.string(), quad: quadSchema })),
}).superRefine((result, context) => {
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

export type OcrRequest = { kind: 'load' } | { kind: 'analyze'; id: number; blob: Blob }
export const ocrResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('state'), state: modelStateSchema }),
  z.object({ kind: z.literal('result'), id: z.number(), result: ocrResultSchema }),
  z.object({ kind: z.literal('error'), id: z.number(), error: z.string() }),
])
export type OcrResponse = z.infer<typeof ocrResponseSchema>
