import { loadTesseract, recognizeTesseract } from './tesseract'
import type { OcrRequest, OcrResponse } from './ocr-contract'

function send(message: OcrResponse) { self.postMessage(message) }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }

async function loadModel() {
  const timeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'Tesseract.js took too long to start. Retry loading text recognition.' } }), 120_000)
  try {
    const worker = await loadTesseract((state) => send({ kind: 'state', state }))
    send({ kind: 'state', state: { kind: 'ready' } })
    return worker
  } finally { clearTimeout(timeout) }
}

let modelPromise: ReturnType<typeof loadModel> | undefined
let queue = Promise.resolve()

async function analyze({ id, blob }: Extract<OcrRequest, { kind: 'analyze' }>) {
  const timeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'Local text recognition took more than two minutes. Recording stopped; captured screenshots are preserved.' } }), 120_000)
  try {
    if (!modelPromise) throw new Error('Load text recognition before analyzing screenshots.')
    const worker = await modelPromise
    const result = await recognizeTesseract(worker, blob)
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
