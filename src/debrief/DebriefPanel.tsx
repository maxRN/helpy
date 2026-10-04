import { useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../../convex/_generated/api'
import { erpSync } from '../erp/sync'
import { startTeach } from '../erp/teach'
import type { LogLine } from '../server/debrief'
import { emitEvent, getEventLog } from '../shared/bus'
import { useSession } from '../shared/session'
import type { AppEvent, Gap, Quote, WorkMap } from '../shared/types'
import { ClipPlayer } from './ClipPlayer'
import { needsGuardrailQuestion, toLogLines } from './sessionLog'

const MAX_QUESTIONS = 6

export const useDebriefUi = create<{ open: boolean }>(() => ({ open: false }))
export const openDebrief = () => useDebriefUi.setState({ open: true })

type Phase =
  | { kind: 'intro' }
  | { kind: 'finding' }
  | { kind: 'asking'; queue: Gap[] }
  | { kind: 'building' }
  | { kind: 'teachback'; workMap: WorkMap; text: string }
  | { kind: 'done'; workMap: WorkMap }
  | { kind: 'error'; message: string; retry: () => void }

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `${url} failed (${res.status})`)
  return data as T
}

const voice = () => import('../agent/voice')

/**
 * The debrief: clip + spoken question for every gap, answers by voice (or typed),
 * then the Work Map, the teach-back and the expert's confirmation.
 */
export function DebriefPanel() {
  const open = useDebriefUi((s) => s.open)
  const sessionId = useSession((s) => s.sessionId)
  const stored = useQuery(api.events.list, open ? { sessionId } : 'skip') as AppEvent[] | undefined
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [asked, setAsked] = useState(0)
  const [answer, setAnswer] = useState('')
  const [listening, setListening] = useState(false)
  const [doneReason, setDoneReason] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [corrections, setCorrections] = useState<Quote[]>([])
  const askedFor = useRef<string | null>(null)

  // Prefer what Convex stored (survives reloads); fall back to this page's in-memory log.
  const log = (): LogLine[] => {
    const events = stored && stored.length > 0 ? stored : getEventLog()
    return toLogLines(events)
  }
  const relNow = () => {
    const t0 = useSession.getState().t0
    return t0 === null ? 0 : Date.now() - t0
  }

  const findGaps = async (count = asked) => {
    setPhase({ kind: 'finding' })
    try {
      const res = await post<{ gaps: Gap[]; done: boolean; doneReason: string; notEnoughWork?: boolean }>('/api/debrief/gaps', {
        log: log(),
        asked: count,
        needGuardrail: needsGuardrailQuestion(stored && stored.length > 0 ? stored : getEventLog()),
      })
      setDoneReason(res.doneReason)
      // Too little task on screen: say so honestly instead of inventing questions or a Work Map.
      if (res.notEnoughWork) return setPhase({ kind: 'error', message: res.doneReason, retry: () => void findGaps(count) })
      if (res.done || res.gaps.length === 0 || count >= MAX_QUESTIONS) return void build()
      setPhase({ kind: 'asking', queue: res.gaps })
    } catch (err) {
      setPhase({ kind: 'error', message: String(err instanceof Error ? err.message : err), retry: () => void findGaps(count) })
    }
  }

  const build = async () => {
    setPhase({ kind: 'building' })
    try {
      const { workMap, warnings: w } = await post<{ workMap: WorkMap; warnings: string[] }>('/api/workmap', { sessionId, log: log() })
      setWarnings(w)
      const { text } = await post<{ text: string }>('/api/debrief/teachback', { workMap })
      setPhase({ kind: 'teachback', workMap, text })
    } catch (err) {
      setPhase({ kind: 'error', message: String(err instanceof Error ? err.message : err), retry: () => void build() })
    }
  }

  const nextGap = (queue: Gap[]) => {
    const rest = queue.slice(1)
    const count = asked + 1
    setAsked(count)
    setAnswer('')
    if (rest.length > 0 && count < MAX_QUESTIONS) setPhase({ kind: 'asking', queue: rest })
    else void findGaps(count)
  }

  // Ask the current gap by voice when the agent is connected; typing always works too.
  useEffect(() => {
    if (phase.kind !== 'asking') return
    const gap = phase.queue[0]
    if (askedFor.current === gap.id) return
    askedFor.current = gap.id
    void voice().then(async (v) => {
      if (!v.isConnected()) {
        emitEvent({ source: 'voice', kind: 'question_asked', speaker: 'agent', text: gap.question, meta: { phase: 'debrief', gapId: gap.id } })
        return
      }
      setListening(true)
      try {
        const quote = await v.ask(gap.question)
        setAnswer(quote.text)
        nextGap(phase.queue)
      } catch {
        // timed out or disconnected: the expert can still type
      } finally {
        setListening(false)
      }
    })
  }, [phase])

  const submitTyped = (queue: Gap[]) => {
    if (answer.trim()) emitEvent({ source: 'voice', kind: 'answer_given', speaker: 'expert', text: answer.trim(), t: relNow(), meta: { phase: 'debrief', gapId: queue[0].id } })
    nextGap(queue)
  }

  const runTeachback = async (workMap: WorkMap, text: string) => {
    const v = await voice()
    if (!v.isConnected()) return
    const verdict = await v.teachBack(text)
    if (verdict.confirmed) confirm(workMap, text)
    else if (verdict.correction) void correct(verdict.correction)
  }

  const confirm = (workMap: WorkMap, text: string) => {
    const final: WorkMap = { ...workMap, teachback: { text, confirmed: true, corrections } }
    useSession.getState().setWorkMap(final)
    erpSync()?.saveWorkMap(final.sessionId, final)
    setPhase({ kind: 'done', workMap: final })
  }

  const correct = async (correction: string) => {
    const quote: Quote = { text: correction, t: relNow(), speaker: 'expert' }
    setCorrections((c) => [...c, quote])
    emitEvent({ source: 'voice', kind: 'teachback_result', speaker: 'expert', text: correction, t: quote.t, meta: { confirmed: false } })
    setAnswer('')
    await build()
  }

  if (!open) return null

  const close = () => useDebriefUi.setState({ open: false })
  const reset = () => {
    setPhase({ kind: 'intro' })
    setAsked(0)
    setCorrections([])
    setWarnings([])
    askedFor.current = null
  }
  const primary = 'h-9 rounded-sm bg-sky-700 px-4 text-[13px] font-medium text-white hover:bg-sky-800 disabled:opacity-40'
  const secondary = 'h-9 rounded-sm border border-slate-400 bg-white px-3 text-[13px] text-slate-800 hover:bg-slate-50'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Debrief">
      <div className="flex w-full max-w-3xl min-w-0 flex-col gap-4 rounded-md bg-white p-5 text-slate-900 shadow-xl">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="text-[17px] font-semibold">Debrief</h2>
          <span className="text-[12px] text-slate-500">
            {asked} of {MAX_QUESTIONS} questions · session {sessionId}
          </span>
          <button type="button" onClick={close} className="ml-auto text-[13px] text-slate-600 hover:underline">
            Close
          </button>
        </header>

        {phase.kind === 'intro' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px]">
              The apprentice now asks about what is still unclear, shows the screen moment for each question, and then explains the whole process back.
            </p>
            <p className="text-[12px] text-slate-600">{log().length} log lines in this session. Connect the voice agent with “Debrief” in the voice panel to answer by voice; typing works too.</p>
            <div>
              <button type="button" className={primary} disabled={log().length === 0} onClick={() => void findGaps(0)}>
                Start debrief
              </button>
            </div>
          </div>
        ) : null}

        {phase.kind === 'finding' ? <p className="text-[14px] text-slate-600">Looking for what is still unclear…</p> : null}

        {phase.kind === 'asking' ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <ClipPlayer taskId={sessionId} start={phase.queue[0].clip.start} end={phase.queue[0].clip.end} />
            <div className="flex min-w-0 flex-col gap-3">
              <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-600">{phase.queue[0].kind.replace('_', ' ')}</span>
              <p className="text-[18px] leading-snug font-medium text-balance">{phase.queue[0].question}</p>
              {listening ? <p className="text-[12px] text-emerald-700">Listening for the answer…</p> : null}
              <label htmlFor="debrief-answer" className="text-[12px] font-medium text-slate-600">
                Answer
              </label>
              <textarea
                id="debrief-answer"
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="rounded-sm border border-slate-300 p-2 text-[14px] outline-none focus:border-sky-600"
                placeholder="Type the answer, or say it out loud"
              />
              <div className="flex gap-2">
                <button type="button" className={primary} onClick={() => submitTyped(phase.queue)}>
                  Next
                </button>
                <button type="button" className={secondary} onClick={() => nextGap(phase.queue)}>
                  Skip
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {phase.kind === 'building' ? <p className="text-[14px] text-slate-600">Writing the Work Map and the explanation…</p> : null}

        {phase.kind === 'teachback' ? (
          <div className="flex flex-col gap-3">
            {doneReason ? <p className="text-[12px] text-slate-500">Why the questions stopped: {doneReason}</p> : null}
            <h3 className="text-[14px] font-semibold">Here is how I understood it</h3>
            <p className="rounded-sm bg-sky-50 p-3 text-[14px] leading-relaxed text-sky-950">{phase.text}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => void runTeachback(phase.workMap, phase.text)}>
                Read it aloud
              </button>
              <button type="button" className={primary} onClick={() => confirm(phase.workMap, phase.text)}>
                Yes, that's how it works
              </button>
            </div>
            <label htmlFor="debrief-correction" className="text-[12px] font-medium text-slate-600">
              Or correct a detail
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="debrief-correction"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-sm border border-slate-300 px-2 text-[14px] outline-none focus:border-sky-600"
                placeholder="e.g. Only Weber releases Kramer, not the CFO"
              />
              <button type="button" className={secondary} disabled={!answer.trim()} onClick={() => void correct(answer.trim())}>
                Correct and rewrite
              </button>
            </div>
            {warnings.length ? <p className="text-[11px] text-amber-800">{warnings.join(' ')}</p> : null}
          </div>
        ) : null}

        {phase.kind === 'done' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px]">
              Work Map confirmed: {phase.workMap.steps.length} steps · {phase.workMap.steps.filter((s) => s.isJudgmentCall).length} judgment calls ·{' '}
              {phase.workMap.guardrails.length} guardrails. Saved for every device.
            </p>
            <ol className="list-decimal pl-5 text-[13px] text-slate-700">
              {phase.workMap.steps.map((s) => (
                <li key={s.id}>
                  {s.title}
                  {s.reason ? <span className="text-slate-500"> — “{s.reason.text}”</span> : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primary}
                onClick={() =>
                  void startTeach(phase.workMap).then(() => {
                    close()
                    reset()
                  })
                }
              >
                Start teach mode
              </button>
              <button type="button" className={secondary} onClick={reset}>
                Debrief again
              </button>
            </div>
          </div>
        ) : null}

        {phase.kind === 'error' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-red-700">{phase.message}</p>
            <div>
              <button type="button" className={secondary} onClick={phase.retry}>
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
