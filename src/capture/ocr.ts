import { create } from 'zustand'
import { ocrResponseSchema } from './ocr-contract'
import type { ModelState, OcrRequest, OcrResult } from './ocr-contract'

export const useOcrModel = create<ModelState>(() => ({ kind: 'loading', message: 'Loading local text recognition model…', downloadedBytes: 0 }))
let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (result: OcrResult) => void; reject: (error: Error) => void }>()

function fail(error: string) {
  worker?.terminate()
  worker = undefined
  useOcrModel.setState({ kind: 'failed', error }, true)
  for (const job of pending.values()) job.reject(new Error(error))
  pending.clear()
}

export function loadOcrModel() {
  if (worker) return
  useOcrModel.setState({ kind: 'loading', message: 'Loading local text recognition model…', downloadedBytes: 0 }, true)
  try {
    worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      const parsed = ocrResponseSchema.safeParse(data)
      if (!parsed.success) { fail('The text recognition worker returned an invalid response.'); return }
      const message = parsed.data
      if (message.kind === 'state') {
        if (message.state.kind === 'failed') fail(message.state.error)
        else useOcrModel.setState(message.state, true)
        return
      }
      const job = pending.get(message.id)
      if (!job) return
      pending.delete(message.id)
      if (message.kind === 'result') job.resolve(message.result)
      else job.reject(new Error(message.error))
    }
    worker.onerror = (event) => fail(event.message || 'The local text recognition worker stopped. Reload or retry loading the model.')
    worker.onmessageerror = () => fail('Could not communicate with the local text recognition worker.')
    worker.postMessage({ kind: 'load' } satisfies OcrRequest)
    void navigator.storage?.persist?.().catch(() => false)
  } catch (error) { fail(error instanceof Error ? error.message : 'Could not start local text recognition.') }
}

export function analyzeScreenshot(blob: Blob): Promise<OcrResult> {
  if (!worker || useOcrModel.getState().kind !== 'ready') return Promise.reject(new Error('Wait for the local text recognition model to finish loading before recording.'))
  if (pending.size >= 30) return Promise.reject(new Error('Text recognition cannot keep up with screen capture on this device. Recording stopped to preserve the captured screenshots.'))
  const id = ++nextId
  const activeWorker = worker
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try { activeWorker.postMessage({ kind: 'analyze', id, blob } satisfies OcrRequest) }
    catch (error) { pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))) }
  })
}
