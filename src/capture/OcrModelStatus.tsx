import { loadOcrModel, useOcrModel } from './ocr'

export function OcrModelStatus() {
  const state = useOcrModel()
  if (state.kind === 'ready') return null
  return (
    <aside className="model-status" aria-label="Local text recognition">
      {state.kind === 'loading' ? (
        <p role="status">
          {state.message}
          {state.downloadedBytes > 0 && ` ${Math.round(state.downloadedBytes / 1_000_000)} MB loaded.`}
          {' '}You can start a task when the model is ready. Downloaded files are cached on this device.
        </p>
      ) : (
        <>
          <p className="error" role="alert">Text recognition could not start: {state.error}</p>
          <button onClick={loadOcrModel}>Retry loading model</button>
        </>
      )}
    </aside>
  )
}
