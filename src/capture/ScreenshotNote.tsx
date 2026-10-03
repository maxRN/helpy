import type { Doc } from '../../convex/_generated/dataModel'
import { SMOLVLM_MODEL } from './ocr-contract'

export function ScreenshotNote({ ocr }: { ocr: Doc<'screenshots'>['ocr'] }) {
  if (!ocr) return <p className="screenshot-note muted">This screenshot was captured before text recognition was added.</p>
  if (ocr.kind === 'pending') return <p className="screenshot-note muted" role="status">Text recognition pending.</p>
  if (ocr.kind === 'failed') return <p className="screenshot-note error">Text recognition failed: {ocr.error}</p>
  const { result } = ocr
  if (result.model === SMOLVLM_MODEL) return (
    <details className="screenshot-note">
      <summary>Text note</summary>
      <p className="muted">SmolVLM-500M-Instruct · {result.width} × {result.height} pixels.</p>
      {result.text ? <p className="ocr-text">{result.text}</p> : <p className="muted">No text detected.</p>}
    </details>
  )
  return (
    <details className="screenshot-note">
      <summary>Text note · {result.regions.length} regions</summary>
      <p className="muted">Florence-2-base-ft · {result.width} × {result.height} pixels. Positions are the four text corners, measured from the image's top left.</p>
      {result.regions.length === 0 ? <p className="muted">No text detected.</p> : (
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
