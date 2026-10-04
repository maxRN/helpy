import type { Worker } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import { OCR_LANGUAGE, TESSERACT_MODEL, TESSERACT_REVISION, ocrResultSchema } from './ocr-contract'
import type { ModelState } from './ocr-contract'

export async function loadTesseract(onState: (state: ModelState) => void) {
  const { createWorker, OEM, PSM } = await import('tesseract.js')
  const worker = await createWorker(OCR_LANGUAGE, OEM.LSTM_ONLY, {
    workerPath: new URL(workerPath, globalThis.location.origin).href,
    workerBlobURL: false,
    cachePath: 'sabine-tesseract-v7',
    logger: ({ status, progress }) => {
      if (status !== 'recognizing text') onState({ kind: 'loading', message: `Tesseract.js: ${status}…`, progress: progress * 100 })
    },
    errorHandler: (error: unknown) => onState({ kind: 'failed', error: error instanceof Error ? error.message : String(error) }),
  })
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  return worker
}

export async function recognizeTesseract(worker: Worker, blob: Blob) {
  const image = await createImageBitmap(blob)
  const { width, height } = image
  image.close()
  const { data } = await worker.recognize(blob, { rotateAuto: false }, { text: true, blocks: true })
  if (!data.blocks && data.text.trim()) throw new Error('Text recognition returned text without word coordinates.')
  const regions = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) =>
    paragraph.lines.flatMap((line) => line.words.map(({ text, confidence, bbox }) => ({ text, confidence, bbox }))),
  ))
  return ocrResultSchema.parse({
    model: TESSERACT_MODEL, revision: TESSERACT_REVISION, language: OCR_LANGUAGE,
    width, height, text: data.text, regions,
  })
}
