import { AutoProcessor, Florence2ForConditionalGeneration, Florence2Processor, Idefics3ForConditionalGeneration, Idefics3Processor, RawImage, Tensor, env } from '@huggingface/transformers'
import type { ProgressCallback } from '@huggingface/transformers'
import { z } from 'zod'
import { OCR_MODELS, OCR_TASK, ocrResultSchema, quadSchema } from './ocr-contract'
import type { OcrModelId, OcrRequest, OcrResponse } from './ocr-contract'

function send(message: OcrResponse) { self.postMessage(message) }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }

const smolvlmPrompt = 'Transcribe all visible text in this screenshot in reading order. Preserve line breaks. Return only the text, without descriptions, explanations, or markdown formatting. If there is no visible text, return an empty response.'

function smolvlmInputs(processor: Idefics3Processor, image: RawImage) {
  const prompt = processor.apply_chat_template([{ role: 'user', content: [
    { type: 'image' }, { type: 'text', text: smolvlmPrompt },
  ] }], { add_generation_prompt: true, tokenize: false })
  if (typeof prompt !== 'string') throw new Error('The model returned an unexpected text extraction prompt.')
  return processor(prompt, image)
}

async function loadFlorence(options: { revision: string; progress_callback: ProgressCallback }) {
  const [model, processor] = await Promise.all([
    Florence2ForConditionalGeneration.from_pretrained(OCR_MODELS.florence.model, {
      ...options, device: 'webgpu',
      dtype: { embed_tokens: 'fp32', vision_encoder: 'fp32', encoder_model: 'q4', decoder_model_merged: 'q4' },
    }),
    AutoProcessor.from_pretrained(OCR_MODELS.florence.model, options),
  ])
  if (!(processor instanceof Florence2Processor)) throw new Error('The downloaded model has an unexpected processor.')
  const kind: 'florence' = 'florence'
  return { kind, model, processor }
}

async function loadSmolvlm(options: { revision: string; progress_callback: ProgressCallback }) {
  const [model, processor] = await Promise.all([
    Idefics3ForConditionalGeneration.from_pretrained(OCR_MODELS.smolvlm.model, {
      ...options, device: 'webgpu',
      dtype: { embed_tokens: 'fp32', vision_encoder: 'fp32', decoder_model_merged: 'q4' },
    }),
    AutoProcessor.from_pretrained(OCR_MODELS.smolvlm.model, options),
  ])
  if (!(processor instanceof Idefics3Processor)) throw new Error('The downloaded model has an unexpected processor.')
  const kind: 'smolvlm' = 'smolvlm'
  return { kind, model, processor }
}

async function loadModel(modelId: OcrModelId) {
  const config = OCR_MODELS[modelId]
  if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error('Local text recognition requires WebGPU. Open this app in a current desktop Chrome or Edge browser.')
  if (!('caches' in self)) throw new Error('Local model storage is unavailable. Enable browser storage and reload.')
  const cache = await caches.open(config.cache)
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
      kind: 'loading', message: `Loading ${config.label} on this device…`,
      progress: progress.progress,
    } })
  }
  const options = { revision: config.revision, progress_callback }
  const loaded = await (modelId === 'florence' ? loadFlorence(options) : loadSmolvlm(options))
  if (cacheError) throw new Error(`Could not cache the model on this device: ${errorMessage(cacheError)}`)
  if (!loaded.processor.tokenizer) throw new Error('The downloaded model is missing its tokenizer.')
  send({ kind: 'state', state: { kind: 'loading', message: 'Download complete. Preparing local text recognition…', progress: 100 } })
  const warmupTimeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'The local model took too long to start. Retry loading the cached model.' } }), 120_000)
  try {
    if (loaded.kind === 'florence') {
      const text = loaded.processor.tokenizer(loaded.processor.construct_prompts(OCR_TASK))
      await loaded.model.generate({ ...text, pixel_values: new Tensor('float32', new Float32Array(3 * 768 * 768), [1, 3, 768, 768]), max_new_tokens: 1 })
    } else {
      const image = new RawImage(new Uint8ClampedArray(3 * 512 * 512), 512, 512, 3)
      const inputs = await smolvlmInputs(loaded.processor, image)
      await loaded.model.generate({ ...inputs, max_new_tokens: 1, do_sample: false })
    }
  } finally { clearTimeout(warmupTimeout) }
  send({ kind: 'state', state: { kind: 'ready' } })
  return loaded
}

let modelPromise: ReturnType<typeof loadModel> | undefined
let queue = Promise.resolve()
const regionsSchema = z.object({ labels: z.array(z.string()), quad_boxes: z.array(quadSchema) })

async function analyze({ id, blob }: Extract<OcrRequest, { kind: 'analyze' }>) {
  const timeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'Local text recognition took more than two minutes. Recording stopped; captured screenshots are preserved.' } }), 120_000)
  try {
    if (!modelPromise) throw new Error('Load the OCR model before analyzing screenshots.')
    const loaded = await modelPromise
    const image = await RawImage.fromBlob(blob)
    if (loaded.kind === 'smolvlm') {
      const inputs: Record<string, unknown> = await smolvlmInputs(loaded.processor, image)
      if (!(inputs.input_ids instanceof Tensor)) throw new Error('The model returned unexpected screenshot inputs.')
      const ids = await loaded.model.generate({ ...inputs, max_new_tokens: 2048, do_sample: false })
      if (!(ids instanceof Tensor)) throw new Error('Text recognition returned unexpected output.')
      const generated = ids.slice(null, [inputs.input_ids.dims[1], ids.dims[1]])
      if (generated.dims[1] >= 2048) throw new Error('Text recognition exceeded the model output limit. The screenshot was saved, but its text is incomplete.')
      const text = loaded.processor.batch_decode(generated, { skip_special_tokens: true })[0]
      if (typeof text !== 'string') throw new Error('Text recognition returned no output.')
      const result = ocrResultSchema.parse({
        model: OCR_MODELS.smolvlm.model, revision: OCR_MODELS.smolvlm.revision,
        width: image.width, height: image.height, text: text.trim(),
      })
      send({ kind: 'result', id, result })
      return
    }
    const { model, processor } = loaded
    const inputs = await processor(image, OCR_TASK)
    const ids = await model.generate({ ...inputs, max_new_tokens: 1023, num_beams: 1, do_sample: false })
    if (!(ids instanceof Tensor)) throw new Error('Text recognition returned unexpected output.')
    const text = processor.batch_decode(ids, { skip_special_tokens: false })[0]
    if (ids.dims[1] >= 1024 || !text?.endsWith('</s>')) throw new Error('Text recognition exceeded the model output limit. The screenshot was saved, but its text is incomplete.')
    const output: unknown = processor.post_process_generation(text, OCR_TASK, image.size)[OCR_TASK]
    const { labels, quad_boxes } = regionsSchema.parse(output)
    if (labels.length !== quad_boxes.length) throw new Error('Text recognition returned mismatched text and positions.')
    const result = ocrResultSchema.parse({
      model: OCR_MODELS.florence.model, revision: OCR_MODELS.florence.revision, width: image.width, height: image.height,
      regions: quad_boxes.map((quad, index) => ({ text: labels[index], quad })),
    })
    send({ kind: 'result', id, result })
  } catch (error) { send({ kind: 'error', id, error: errorMessage(error) }) }
  finally { clearTimeout(timeout) }
}

self.onmessage = ({ data }: MessageEvent<OcrRequest>) => {
  if (data.kind === 'load') {
    modelPromise ??= loadModel(data.modelId)
    void modelPromise.catch((error: unknown) => send({ kind: 'state', state: { kind: 'failed', error: errorMessage(error) } }))
  } else {
    queue = queue.then(() => analyze(data))
  }
}
