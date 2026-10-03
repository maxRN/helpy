import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { PauseLogEntry } from '../../agent/pause'
import { useTaskRecording } from '../../capture/TaskRecorder'
import { mascot } from '../../mascot'
import { session, useSession } from '../../shared/session'
import { pauseLog, setOffRecord, startVoice, useVoice } from '../voice'
import { panel } from './store'
import { field, mmss, primaryBtn, secondaryBtn } from './ui'

function Clock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="tabular-nums">{mmss(now - startedAt)}</span>
}

/** "Why is Helpy quiet?" in one line: the pause detector's latest decision (Apprentice Test question 1). */
function PauseLine() {
  const [entry, setEntry] = useState<PauseLogEntry | null>(null)
  useEffect(() => {
    const timer = setInterval(() => void pauseLog().then((log) => setEntry(log.at(-1) ?? null)), 700)
    return () => clearInterval(timer)
  }, [])
  if (!entry) return null
  return (
    <p className="m-0 text-[14px] text-muted">
      {entry.pause ? 'You paused. I may ask now.' : `I stay quiet: ${entry.blockers.join(', ') || 'you are busy'}.`}
    </p>
  )
}

/** Record what I do: name it, share the screen, work. While recording: pause and "I'm done". */
export function RecordView() {
  const { state, start, finish, error } = useTaskRecording()
  const createProject = useMutation(api.projects.create)
  const offRecord = useSession((s) => s.offRecord)
  const voiceError = useVoice((s) => s.error)
  const voiceOn = useVoice((s) => s.mode === 'capture')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const begin = async () => {
    const processName = name.trim()
    if (!processName) return
    setBusy(true)
    try {
      const projectId: Id<'projects'> = await createProject({ name: processName })
      await start({ _id: projectId, name: processName }, { stay: true })
      if (session().t0 === null) return // sharing was cancelled or failed; the error shows below
      panel.setActivity({ kind: 'recording', processId: projectId })
      panel.close()
      mascot.setState('listening')
      mascot.bubble('I’m watching and listening. Work as usual and tell me what you do.', { ttlMs: 7000 })
      void startVoice('capture')
    } finally {
      setBusy(false)
    }
  }

  // Helpy reacts to the end of the recording (here or via the browser's "Stop sharing") in Helpy.tsx.
  const done = async () => {
    if (offRecord) await setOffRecord(false)
    await finish()
  }

  if (state.kind !== 'idle') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="m-0 flex items-center gap-2 text-[16px] font-medium text-ink">
            <span className={`size-2.5 rounded-full ${offRecord ? 'bg-faint' : 'animate-pulse bg-[#e5484d]'}`} aria-hidden />
            {state.kind === 'starting' ? 'Starting…' : offRecord ? 'Paused, off the record' : 'I’m watching and listening'}
            {'task' in state && state.kind === 'recording' ? (
              <span className="ml-auto text-muted">
                <Clock startedAt={state.task.startedAt} />
              </span>
            ) : null}
          </p>
          {offRecord ? (
            <p className="m-0 mt-1 text-[15px] text-muted">Nothing is recorded, written down or sent until you continue.</p>
          ) : voiceOn ? (
            <div className="mt-1">
              <PauseLine />
            </div>
          ) : (
            <p className="m-0 mt-1 text-[15px] text-muted">Tell me what you do and why. I only ask when you pause.</p>
          )}
        </div>
        <button type="button" className={secondaryBtn} onClick={() => void setOffRecord(!offRecord)} aria-pressed={offRecord}>
          {offRecord ? 'Continue recording' : 'Pause (off the record)'}
        </button>
        <button type="button" className={primaryBtn} disabled={state.kind === 'starting' || state.kind === 'saving'} onClick={() => void done()}>
          {state.kind === 'saving' ? 'Saving…' : state.kind === 'save-failed' ? 'Try saving again' : 'I’m done'}
        </button>
        {voiceError ? <p className="m-0 text-[14px] text-muted">{voiceError}</p> : null}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void begin()
      }}
    >
      <h2 className="m-0 text-[21px] font-semibold tracking-tight text-ink">Show me how you do it</h2>
      <div>
        <label htmlFor="helpy-process-name" className="block text-[16px] font-medium text-ink">
          What will you show?
        </label>
        <input id="helpy-process-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pay supplier invoices…" className={`${field} mt-2 h-12`} />
      </div>
      <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[15px] leading-snug text-muted">
        <li>Share your entire screen when the browser asks.</li>
        <li>Work as usual and say what you do, and why.</li>
        <li>I only ask when you pause. You can pause me any time.</li>
      </ol>
      {error ? (
        <div role="alert" className="rounded-lg bg-guard-soft px-3 py-2">
          <p className="m-0 text-[15px] text-guard">I could not start. If the browser asked, choose “Entire screen” and try again.</p>
          <p className="m-0 mt-1 text-[13px] text-muted">{error}</p>
        </div>
      ) : null}
      <button type="submit" className={primaryBtn} disabled={!name.trim() || busy}>
        <span className="size-3 rounded-full bg-white" aria-hidden />
        {busy ? 'Starting…' : 'Start recording'}
      </button>
    </form>
  )
}
