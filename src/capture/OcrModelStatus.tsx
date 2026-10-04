import { OCR_MODELS, ocrModelIdSchema } from './ocr-contract'
import { loadOcrModel, selectOcrModel, useOcrModel } from './ocr'
import { useTaskRecording } from './TaskRecorder'
import { loadPiiModel, usePiiModel } from './pii'

export function OcrModelStatus() {
  const { state, modelId } = useOcrModel()
  const { state: pii } = usePiiModel()
  const recording = useTaskRecording()
  const busy = recording.state.kind !== 'idle'
  return (
    <aside className="model-status" aria-label="Local text recognition">
      <label htmlFor="ocr-model">Text extraction model</label>
      <select id="ocr-model" value={modelId} disabled={busy} onChange={(event) => selectOcrModel(ocrModelIdSchema.parse(event.target.value))}>
        {ocrModelIdSchema.options.map((id) => <option key={id} value={id}>{OCR_MODELS[id].label}</option>)}
      </select>
      {busy && <p>Finish the task before switching models.</p>}
      {state.kind === 'ready' ? <p role="status">{OCR_MODELS[modelId].label} is ready on this device.</p> : state.kind === 'loading' ? (
        <>
          <p role="status">{state.message} {Math.floor(state.progress)}%. You can start a task when text recognition and PII redaction are ready.</p>
          <progress aria-label="Text recognition loading progress" max={100} value={state.progress} />
        </>
      ) : (
        <>
          <p className="error" role="alert">Text recognition could not start: {state.error}</p>
          <button disabled={busy} onClick={loadOcrModel}>Retry loading text recognition</button>
        </>
      )}
      {pii.kind === 'ready' ? <p role="status">PII redaction is ready on this device.</p> : pii.kind === 'failed' ? (
        <>
          <p className="error" role="alert">PII redaction could not start: {pii.error}</p>
          <button disabled={busy} onClick={() => { void loadPiiModel().catch(() => undefined) }}>Retry loading PII redaction</button>
        </>
      ) : <p role="status">{pii.kind === 'loading' ? `${pii.message} ${Math.floor(pii.progress)}%.` : 'Preparing PII redaction…'}</p>}
    </aside>
  )
}
