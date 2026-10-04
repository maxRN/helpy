import { createWorker, OEM, PSM } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import { OCR_LANGUAGE, TESSERACT_MODEL, TESSERACT_REVISION, tesseractResultSchema } from './ocr-contract'
import type { OcrRequest, OcrResponse } from './ocr-contract'

function send(message: OcrResponse) { self.postMessage(message) }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }

async function loadModel() {
  const timeout = setTimeout(() => send({ kind: 'state', state: { kind: 'failed', error: 'Tesseract.js took too long to start. Retry loading text recognition.' } }), 120_000)
  try {
    const worker = await createWorker(OCR_LANGUAGE, OEM.LSTM_ONLY, {
      workerPath: new URL(workerPath, self.location.origin).href,
      workerBlobURL: false,
      cachePath: 'sabine-tesseract-v7',
      logger: ({ status, progress }) => {
        if (status === 'recognizing text') return
        send({ kind: 'state', state: { kind: 'loading', message: `Tesseract.js: ${status}…`, progress: progress * 100 } })
      },
      errorHandler: (error: unknown) => send({ kind: 'state', state: { kind: 'failed', error: errorMessage(error) } }),
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
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
    const image = await createImageBitmap(blob)
    const { width, height } = image
    image.close()
    const { data } = await worker.recognize(blob, { rotateAuto: false }, { text: true, blocks: true })
    if (!data.blocks && data.text.trim()) throw new Error('Text recognition returned text without word coordinates.')
    const regions = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) => line.words.map(({ text, confidence, bbox }) => ({ text, confidence, bbox }))),
    ))
    const result = tesseractResultSchema.parse({
      model: TESSERACT_MODEL, revision: TESSERACT_REVISION, language: OCR_LANGUAGE,
      width, height, text: data.text, regions,
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
