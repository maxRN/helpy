import { useEffect, useState } from 'react'
import type { PauseLogEntry } from '../agent/pause'
import { useMascot } from '../shared/mascot'
import { useSession } from '../shared/session'
import { installVoiceBridge, resetVoiceClock } from './voiceBridge'

type AgentMode = 'capture' | 'debrief' | 'teach'

const LABEL: Record<AgentMode, string> = {
  capture: 'Interviewer',
  debrief: 'Debrief',
  teach: 'Tutor',
}

/**
 * Temporary voice controls until P4's app shell and mascot land:
 * start/stop the agent, off the record, live subtitles and the last pause decision.
 */
export function VoicePanel() {
  const [active, setActive] = useState<AgentMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pause, setPause] = useState<PauseLogEntry | null>(null)
  const offRecord = useSession((s) => s.offRecord)
  const hasWorkMap = useSession((s) => s.workMap !== null)
  const { state, bubble, clipRequest } = useMascot()

  useEffect(() => {
    installVoiceBridge()
  }, [])

  // The pause log answers "when does the agent ask?": show the latest decision live.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timer = setInterval(() => {
      void import('../agent/pause').then(({ getPauseLog }) => {
        if (!cancelled) setPause(getPauseLog().at(-1) ?? null)
      })
    }, 500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active])

  const start = async (mode: AgentMode) => {
    setBusy(true)
    setError('')
    try {
      const voice = await import('../agent/voice')
      resetVoiceClock()
      await voice.start(mode)
      setActive(mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setActive(null)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      const voice = await import('../agent/voice')
      await voice.stop()
    } finally {
      setActive(null)
      setBusy(false)
    }
  }

  const toggleOffRecord = async () => {
    const next = !offRecord
    const voice = await import('../agent/voice')
    if (voice.isConnected()) voice.setOffRecord(next, 'ui')
    else useSession.getState().setOffRecord(next)
  }

  const btn = 'rounded-sm border px-2 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <aside className="fixed right-3 bottom-3 z-40 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 rounded-md border border-slate-300 bg-white p-3 text-[13px] text-slate-900 shadow-lg">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
        <span className="font-semibold">Apprentice voice</span>
        <span className="ml-auto text-[12px] text-slate-500">{active ? `${LABEL[active]} · ${state}` : 'not connected'}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['capture', 'debrief', 'teach'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy || active === m || (m === 'teach' && !hasWorkMap)}
            title={m === 'teach' && !hasWorkMap ? 'Load a Work Map first (Teach in the dev panel, or startTeach)' : undefined}
            onClick={() => void start(m)}
            className={`${btn} ${active === m ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-400 bg-white hover:bg-slate-50'}`}
          >
            {LABEL[m]}
          </button>
        ))}
        <button type="button" disabled={busy || !active} onClick={() => void stop()} className={`${btn} border-slate-400 bg-white hover:bg-slate-50`}>
          Stop
        </button>
        <button
          type="button"
          onClick={() => void toggleOffRecord()}
          className={`${btn} ml-auto ${offRecord ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-slate-400 bg-white hover:bg-slate-50'}`}
        >
          {offRecord ? 'Off the record' : 'On the record'}
        </button>
      </div>

      {bubble ? <p className="rounded-sm bg-sky-50 px-2 py-1.5 text-sky-900">“{bubble}”</p> : null}
      {clipRequest ? <p className="text-[12px] text-slate-600">Tutor wants to replay step {clipRequest.stepId} (clip player comes with P4).</p> : null}
      {active === 'capture' && pause ? (
        <p className="text-[11px] text-slate-500">
          {pause.pause ? 'Pause' : 'Busy'}
          {pause.blockers.length ? `: ${pause.blockers.join(', ')}` : ''}
          {pause.note ? ` · ${pause.note}` : ''}
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
    </aside>
  )
}
