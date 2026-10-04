import { useMutation } from '@tanstack/react-query'
import type { Doc } from '../../convex/_generated/dataModel'
import { TESSERACT_MODEL } from './ocr-contract'
import { redactPii, usePiiModel } from './pii'

export function ScreenshotNote({ ocr, redaction }: Pick<Doc<'screenshots'>, 'ocr' | 'redaction'>) {
  if (redaction) return (
    <details className="screenshot-note">
      <summary>Redacted text · {redaction.spans.length} PII spans</summary>
      <p className="muted">Desert Ant Labs Redact · {redaction.boxes.length} word boxes replaced.</p>
      <p className="ocr-text">{redaction.text || 'No text detected.'}</p>
      <p className="muted">
        OCR {Math.round(redaction.timings.ocrMs)} ms · PII {Math.round(redaction.timings.piiMs)} ms · Mask {Math.round(redaction.timings.maskMs)} ms · Upload {Math.round(redaction.timings.uploadMs)} ms
      </p>
    </details>
  )
  if (!ocr) return <p className="screenshot-note muted">This screenshot was captured before text recognition was added.</p>
  if (ocr.kind === 'pending') return <p className="screenshot-note muted" role="status">Text recognition pending.</p>
  if (ocr.kind === 'failed') return <p className="screenshot-note error">Screenshot processing failed: {ocr.error}</p>
  return <ExtractedTextNote result={ocr.result} />
}

type NoteResult = Extract<NonNullable<Doc<'screenshots'>['ocr']>, { kind: 'completed' }>['result']

function ExtractedTextNote({ result }: { result: NoteResult }) {
  const text = 'text' in result ? result.text : result.regions.map((region) => region.text).join('\n')
  const redaction = useMutation({ mutationFn: () => redactPii(text) })
  const { state } = usePiiModel()
  const controls = text.trim() && (
    <div className="pii-actions" aria-busy={redaction.isPending}>
      <button type="button" disabled={redaction.isPending || redaction.isSuccess} onClick={() => redaction.mutate()}>
        {redaction.isPending ? 'Redacting…' : redaction.isSuccess ? 'PII checked' : 'Redact PII'}
      </button>
      {redaction.isPending && <p className="muted" role="status">
        {state.kind === 'loading' ? `${state.message} ${Math.floor(state.progress)}%.` : 'Checking text on this device…'}
      </p>}
      {redaction.isSuccess && <p className="muted" role="status">
        {redaction.data !== text ? 'PII redacted.' : 'No PII detected.'} Changes are not saved.
      </p>}
      {redaction.error && <p className="error" role="alert">PII redaction failed: {redaction.error.message}</p>}
    </div>
  )
  if (result.model === TESSERACT_MODEL) return (
    <details className="screenshot-note">
      <summary>Text note · {result.regions.length} words</summary>
      <p className="muted">Tesseract.js · {result.width} × {result.height} pixels. Boxes show top-left and bottom-right pixel coordinates from the image's top left.</p>
      {controls}
      {redaction.isSuccess ? <p className="ocr-text">{redaction.data}</p> : result.regions.length === 0 ? <p className="muted">No text detected.</p> : (
        <dl className="ocr-regions">
          {result.regions.map(({ text, bbox, confidence }, index) => (
            <div key={index}>
              <dt>{text}</dt>
              <dd>({bbox.x0}, {bbox.y0}) → ({bbox.x1}, {bbox.y1}) · {Math.round(confidence)}% confidence</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  )
  if (result.model === 'HuggingFaceTB/SmolVLM-500M-Instruct') return (
    <details className="screenshot-note">
      <summary>Text note</summary>
      <p className="muted">SmolVLM-500M-Instruct · {result.width} × {result.height} pixels.</p>
      {controls}
      {result.text ? <p className="ocr-text">{redaction.data ?? result.text}</p> : <p className="muted">No text detected.</p>}
    </details>
  )
  return (
    <details className="screenshot-note">
      <summary>Text note · {result.regions.length} regions</summary>
      <p className="muted">Florence-2-base-ft · {result.width} × {result.height} pixels. Positions are the four text corners, measured from the image's top left.</p>
      {controls}
      {redaction.isSuccess ? <p className="ocr-text">{redaction.data}</p> : result.regions.length === 0 ? <p className="muted">No text detected.</p> : (
        <dl className="ocr-regions">
          {result.regions.map((region, index) => (
            <div key={index}>
              <dt>{region.text}</dt>
              <dd>{Array.from({ length: 4 }, (_, corner) => `(${Math.round(region.quad[corner * 2])}, ${Math.round(region.quad[corner * 2 + 1])})`).join(' · ')}</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  )
}
