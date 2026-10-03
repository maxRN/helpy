import { AutoProcessor, Florence2ForConditionalGeneration, Florence2Processor, RawImage, Tensor, env } from '@huggingface/transformers'
import type { ProgressCallback } from '@huggingface/transformers'
import { z } from 'zod'
import { OCR_CACHE, OCR_MODEL, OCR_REVISION, OCR_TASK, ocrResultSchema, quadSchema } from './ocr-contract'
import type { OcrRequest, OcrResponse } from './ocr-contract'

function send(message: OcrResponse) { self.postMessage(message) }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }

async function loadModel() {
  if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error('Local text recognition requires WebGPU. Open this app in a current desktop Chrome or Edge browser.')
  if (!('caches' in self)) throw new Error('Local model storage is unavailable. Enable browser storage and reload.')
  const cache = await caches.open(OCR_CACHE)
  let cacheError: unknown
  env.allowLocalModels = false
  env.useBrowserCache = false
  env.useCustomCache = true
  env.customCache = {
    match: (request: RequestInfo) => cache.match(request),
    async put(request: RequestInfo, response: Response) {
      try { await cache.put(request, response) }
      catch (error) { cacheError = error; throw error }
    },
  }

  const progress_callback: ProgressCallback = (progress) => {
    if (progress.status !== 'progress_total') return
    send({ kind: 'state', state: {
      kind: 'loading', message: 'Loading Florence-2-base-ft on this device…',
      progress: progress.progress,
    } })
  }
  const options = { revision: OCR_REVISION, progress_callback }
  const [model, processor] = await Promise.all([
    Florence2ForConditionalGeneration.from_pretrained(OCR_MODEL, {
      ...options, device: 'webgpu',
      dtype: { embed_tokens: 'fp32', vision_encoder: 'fp32', encoder_model: 'q4', decoder_model_merged: 'q4' },
    }),
    AutoProcessor.from_pretrained(OCR_MODEL, options),
  ])
  if (cacheError) throw new Error(`Could not cache the model on this device: ${errorMessage(cacheError)}`)
  if (!(processor instanceof Florence2Processor)) throw new Error('The downloaded model has an unexpected processor.')
  if (!processor.tokenizer) throw new Error('The downloaded model is missing its tokenizer.')
  send({ kind: 'state', state: { kind: 'loading', message: 'Download complete. Preparing local text recognition…', progress: 100 } })
  const text = processor.tokenizer(processor.construct_prompts(OCR_TASK))
  const warmupTimeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'The local model took too long to start. Retry loading the cached model.' } }), 120_000)
  try {
    await model.generate({ ...text, pixel_values: new Tensor('float32', new Float32Array(3 * 768 * 768), [1, 3, 768, 768]), max_new_tokens: 1 })
  } finally { clearTimeout(warmupTimeout) }
  send({ kind: 'state', state: { kind: 'ready' } })
  return { model, processor }
}

let modelPromise: ReturnType<typeof loadModel> | undefined
let queue = Promise.resolve()
const regionsSchema = z.object({ labels: z.array(z.string()), quad_boxes: z.array(quadSchema) })

async function analyze({ id, blob }: Extract<OcrRequest, { kind: 'analyze' }>) {
  const timeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'Local text recognition took more than two minutes. Recording stopped; captured screenshots are preserved.' } }), 120_000)
  try {
    if (!modelPromise) throw new Error('Load the OCR model before analyzing screenshots.')
    const { model, processor } = await modelPromise
    const image = await RawImage.fromBlob(blob)
    const inputs = await processor(image, OCR_TASK)
    const ids = await model.generate({ ...inputs, max_new_tokens: 1023, num_beams: 1, do_sample: false })
    if (!(ids instanceof Tensor)) throw new Error('Text recognition returned unexpected output.')
    const text = processor.batch_decode(ids, { skip_special_tokens: false })[0]
    if (ids.dims[1] >= 1024 || !text?.endsWith('</s>')) throw new Error('Text recognition exceeded the model output limit. The screenshot was saved, but its text is incomplete.')
    const output: unknown = processor.post_process_generation(text, OCR_TASK, image.size)[OCR_TASK]
    const { labels, quad_boxes } = regionsSchema.parse(output)
    if (labels.length !== quad_boxes.length) throw new Error('Text recognition returned mismatched text and positions.')
    const result = ocrResultSchema.parse({
      model: OCR_MODEL, revision: OCR_REVISION, width: image.width, height: image.height,
      regions: quad_boxes.map((quad, index) => ({ text: labels[index], quad })),
    })
    send({ kind: 'result', id, result })
  } catch (error) { send({ kind: 'error', id, error: errorMessage(error) }) }
  finally { clearTimeout(timeout) }
}

self.onmessage = ({ data }: MessageEvent<OcrRequest>) => {
  if (data.kind === 'load') {
    modelPromise ??= loadModel()
    void modelPromise.catch((error: unknown) => send({ kind: 'state', state: { kind: 'failed', error: errorMessage(error) } }))
  } else {
    queue = queue.then(() => analyze(data))
  }
}
