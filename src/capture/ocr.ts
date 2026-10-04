import { create } from 'zustand'
import { OCR_MODELS, ocrModelIdSchema, ocrResponseSchema } from './ocr-contract'
import type { ModelState, OcrModelId, OcrRequest, OcrResult } from './ocr-contract'

export const useOcrModel = create<{ modelId: OcrModelId; state: ModelState }>(() => ({ modelId: 'tesseract', state: { kind: 'loading', message: 'Loading local text recognition…', progress: 0 } }))
const selectionKey = 'sabine-ocr-model'
let selectionLoaded = false
let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (result: OcrResult) => void; reject: (error: Error) => void }>()

function fail(error: string) {
  worker?.terminate()
  worker = undefined
  useOcrModel.setState({ state: { kind: 'failed', error } })
  for (const job of pending.values()) job.reject(new Error(error))
  pending.clear()
}

export function loadOcrModel() {
  if (worker) return
  try {
    if (!selectionLoaded) {
      let saved = localStorage.getItem(selectionKey)
      if (saved === 'smolvlm') {
        saved = 'tesseract'
        localStorage.setItem(selectionKey, saved)
      }
      if (saved !== null) useOcrModel.setState({ modelId: ocrModelIdSchema.parse(saved) })
      selectionLoaded = true
    }
    const { modelId } = useOcrModel.getState()
    useOcrModel.setState({ state: { kind: 'loading', message: `Loading ${OCR_MODELS[modelId].label} on this device…`, progress: 0 } })
    worker = modelId === 'tesseract'
      ? new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./florence.worker.ts', import.meta.url), { type: 'module' })
    const activeWorker = worker
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (worker !== activeWorker) return
      const parsed = ocrResponseSchema.safeParse(data)
      if (!parsed.success) { fail('The text recognition worker returned an invalid response.'); return }
      const message = parsed.data
      if (message.kind === 'state') {
        if (message.state.kind === 'failed') fail(message.state.error)
        else useOcrModel.setState({ state: message.state })
        return
      }
      const job = pending.get(message.id)
      if (!job) return
      pending.delete(message.id)
      if (message.kind === 'result') job.resolve(message.result)
      else job.reject(new Error(message.error))
    }
    worker.onerror = (event) => { if (worker === activeWorker) fail(event.message || 'The local text recognition worker stopped. Reload or retry loading the model.') }
    worker.onmessageerror = () => { if (worker === activeWorker) fail('Could not communicate with the local text recognition worker.') }
    worker.postMessage({ kind: 'load', modelId } satisfies OcrRequest)
    void navigator.storage?.persist?.().catch(() => false)
  } catch (error) { fail(error instanceof Error ? error.message : 'Could not start local text recognition.') }
}

export function selectOcrModel(modelId: OcrModelId) {
  if (modelId === useOcrModel.getState().modelId) return
  if (pending.size > 0) throw new Error('Finish text recognition before switching models.')
  localStorage.setItem(selectionKey, modelId)
  selectionLoaded = true
  worker?.terminate()
  worker = undefined
  useOcrModel.setState({ modelId })
  loadOcrModel()
}

export function analyzeScreenshot(blob: Blob): Promise<OcrResult> {
  if (!worker || useOcrModel.getState().state.kind !== 'ready') return Promise.reject(new Error('Wait for the local text recognition model to finish loading before recording.'))
  if (pending.size >= 30) return Promise.reject(new Error('Text recognition cannot keep up with screen capture on this device. Recording stopped to preserve the captured screenshots.'))
  const id = ++nextId
  const activeWorker = worker
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try { activeWorker.postMessage({ kind: 'analyze', id, blob } satisfies OcrRequest) }
    catch (error) { pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))) }
  })
}
