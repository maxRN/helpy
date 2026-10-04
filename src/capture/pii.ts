import { create } from 'zustand'
import type { Redact } from '@desert-ant-labs/redact'
import type { ModelState } from './ocr-contract'

export const usePiiModel = create<{ state: ModelState | { kind: 'idle' } }>(() => ({ state: { kind: 'idle' } }))
let modelPromise: Promise<Redact> | undefined
let queue = Promise.resolve()

async function loadModel() {
  usePiiModel.setState({ state: { kind: 'loading', message: 'Downloading Redact on this device…', progress: 0 } })
  if (!('caches' in window)) throw new Error('Local model storage is unavailable. Enable browser storage and reload.')
  const cache = await caches.open('sabine-desert-ant-redact-v0.4.0')
  const originalFetch = window.fetch
  // The SDK has no cache adapter. Scope its Hub requests to Cache Storage while loading.
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), window.location.href)
    const isModel = url.origin === 'https://huggingface.co' && (
      url.pathname.startsWith('/desert-ant-labs/redact/resolve/') ||
      url.pathname.startsWith('/api/models/desert-ant-labs/redact/tree/')
    )
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (!isModel || method.toUpperCase() !== 'GET') return originalFetch.call(window, input, init)
    const request = new Request(input, init)
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await originalFetch.call(window, input, init)
    if (!response.ok) throw new Error(`Redact download failed: HTTP ${response.status}.`)
    await cache.put(request, response.clone())
    return response
  }
  try {
    const { Redact } = await import('@desert-ant-labs/redact')
    const model = await Redact.load({
      accelerator: 'wasm',
      litertWasmDir: 'https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/',
      onProgress: (fraction) => usePiiModel.setState({ state: {
        kind: 'loading', message: fraction === 1 ? 'Preparing local PII redaction…' : 'Downloading Redact on this device…',
        progress: fraction * 100,
      } }),
    })
    usePiiModel.setState({ state: { kind: 'ready' } })
    void navigator.storage?.persist?.().catch(() => false)
    return model
  } finally { window.fetch = originalFetch }
}

function getModel() {
  modelPromise ??= loadModel().catch((error: unknown) => {
    const failure = error instanceof Error ? error : new Error(String(error))
    modelPromise = undefined
    usePiiModel.setState({ state: { kind: 'failed', error: failure.message } })
    throw failure
  })
  return modelPromise
}

export function redactPii(text: string): Promise<string> {
  const job = queue.then(async () => {
    const model = await getModel()
    return (await model.redaction(text)).redactedText
  })
  queue = job.then(() => undefined, () => undefined)
  return job
}
