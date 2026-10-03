import { useEffect, useState } from 'react'
import { bus, clearEventLog, getEventLog } from '../shared/bus'
import { useSession } from '../shared/session'
import type { AppEvent } from '../shared/types'
import { FIXTURE_WORKMAP } from './fixtures'
import { resetStepTracker } from './stepTracker'
import { useErp } from './store'
import { startTeach } from './teach'

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function describe(e: AppEvent) {
  switch (e.kind) {
    case 'field_changed':
      return `${e.invoiceId} ${e.targetId}: ${e.from || '∅'} → ${e.to || '∅'}`
    case 'action':
      return `${e.invoiceId} ${e.action}`
    case 'invoice_opened':
      return `opened ${e.invoiceId}`
    default:
      return [e.invoiceId, e.targetId, e.text].filter(Boolean).join(' · ')
  }
}

/** Dev tool: live AppEvent log plus quick switches for testing Teach mode. */
export function DebugPanel() {
  const [events, setEvents] = useState<AppEvent[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const mode = useSession((s) => s.mode)
  const setMode = useSession((s) => s.setMode)
  const setWorkMap = useSession((s) => s.setWorkMap)
  const reset = useErp((s) => s.reset)

  useEffect(() => {
    setEvents(getEventLog().slice(-30))
    const onEvent = () => setEvents(getEventLog().slice(-30))
    bus.on('event', onEvent)
    return () => bus.off('event', onEvent)
  }, [])

  const resetDemo = () => {
    reset()
    resetStepTracker()
    clearEventLog()
    setEvents([])
  }

  const btn = 'rounded-sm border border-slate-600 px-2 py-0.5 hover:bg-slate-700'

  return (
    <aside className="fixed bottom-3 left-3 z-40 w-[min(26rem,calc(100vw-1.5rem))] rounded-md bg-slate-900/95 font-mono text-[11px] text-slate-100 shadow-lg">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-2 py-1.5">
        <button type="button" className="font-semibold" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '▸' : '▾'} Events ({events.length})
        </button>
        <span className="text-slate-400">mode: {mode}</span>
        <span className="ml-auto flex gap-1">
          <button type="button" className={btn} onClick={() => setMode('capture')}>
            Capture
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setWorkMap(FIXTURE_WORKMAP)
              setMode('teach')
            }}
          >
            Teach (fixture)
          </button>
          <button
            type="button"
            className={btn}
            title="Recompile the fixture guardrails from their text via /api/guardrails/compile"
            onClick={() => void startTeach(FIXTURE_WORKMAP).then((r) => console.info('[startTeach]', r))}
          >
            Teach (compile)
          </button>
          <button type="button" className={btn} onClick={resetDemo}>
            Reset demo
          </button>
        </span>
      </div>
      {collapsed ? null : (
        <ol className="max-h-56 overflow-y-auto px-2 py-1">
          {events.length === 0 ? <li className="text-slate-500">No events yet. Open an invoice.</li> : null}
          {[...events].reverse().map((e) => (
            <li key={e.id} className="flex gap-2 border-b border-slate-800 py-0.5">
              <span className="text-slate-500">{fmt(e.t)}</span>
              <span
                className={
                  e.kind === 'guardrail_violation'
                    ? 'text-red-400'
                    : e.kind === 'sequence_deviation'
                      ? 'text-amber-300'
                      : 'text-sky-300'
                }
              >
                {e.kind}
              </span>
              <span className="min-w-0 truncate text-slate-200">{describe(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
