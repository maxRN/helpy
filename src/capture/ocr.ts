import { create } from 'zustand'
import { ocrResponseSchema } from './ocr-contract'
import type { ModelState, OcrRequest, OcrResult } from './ocr-contract'

export const useOcrModel = create<{ state: ModelState }>(() => ({ state: { kind: 'loading', message: 'Loading local text recognition…', progress: 0 } }))
const workers: Worker[] = []
const ready = new Set<Worker>()
let nextId = 0
const pending = new Map<number, { worker: Worker; resolve: (result: OcrResult) => void; reject: (error: Error) => void }>()

function fail(error: string) {
  for (const worker of workers) worker.terminate()
  workers.length = 0
  ready.clear()
  useOcrModel.setState({ state: { kind: 'failed', error } })
  for (const job of pending.values()) job.reject(new Error(error))
  pending.clear()
}

export function loadOcrModel() {
  if (workers.length) return
  try {
    useOcrModel.setState({ state: { kind: 'loading', message: 'Loading Tesseract.js on this device…', progress: 0 } })
    for (let index = 0; index < 2; index++) {
      const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
      workers.push(worker)
      worker.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (!workers.includes(worker)) return
        const parsed = ocrResponseSchema.safeParse(data)
        if (!parsed.success) { fail('The text recognition worker returned an invalid response.'); return }
        const message = parsed.data
        if (message.kind === 'state') {
          if (message.state.kind === 'failed') fail(message.state.error)
          else if (message.state.kind === 'ready') {
            ready.add(worker)
            if (ready.size === workers.length) useOcrModel.setState({ state: { kind: 'ready' } })
          } else if (!ready.has(worker)) useOcrModel.setState({ state: message.state })
          return
        }
        const job = pending.get(message.id)
        if (!job || job.worker !== worker) return
        pending.delete(message.id)
        if (message.kind === 'result') job.resolve(message.result)
        else job.reject(new Error(message.error))
      }
      worker.onerror = (event) => { if (workers.includes(worker)) fail(event.message || 'The local text recognition worker stopped. Reload or retry loading the model.') }
      worker.onmessageerror = () => { if (workers.includes(worker)) fail('Could not communicate with the local text recognition worker.') }
      worker.postMessage({ kind: 'load' } satisfies OcrRequest)
    }
    void navigator.storage?.persist?.().catch(() => false)
  } catch (error) { fail(error instanceof Error ? error.message : 'Could not start local text recognition.') }
}

export function analyzeScreenshot(blob: Blob): Promise<OcrResult> {
  if (!workers.length || useOcrModel.getState().state.kind !== 'ready') return Promise.reject(new Error('Wait for the local text recognition model to finish loading before recording.'))
  if (pending.size >= 30) return Promise.reject(new Error('Text recognition cannot keep up with screen capture on this device. Recording stopped to preserve the captured screenshots.'))
  const id = ++nextId
  const jobs = [...pending.values()]
  const worker = workers.reduce((leastBusy, candidate) => {
    return jobs.filter((job) => job.worker === candidate).length < jobs.filter((job) => job.worker === leastBusy).length ? candidate : leastBusy
  })
  return new Promise((resolve, reject) => {
    pending.set(id, { worker, resolve, reject })
    try { worker.postMessage({ kind: 'analyze', id, blob } satisfies OcrRequest) }
    catch (error) { pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))) }
  })
}
