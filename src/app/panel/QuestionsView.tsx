import { useMutation } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { mascot } from '../../mascot'
import { emitEvent } from '../../shared/bus'
import type { Gap, WorkMap } from '../../shared/types'
import { ClipPlayer } from '../player/ClipPlayer'
import { askAloud, startVoice, stopVoice, teachBackAloud, useVoice } from '../voice'
import { loadGaps, teachbackText } from './gaps'
import { useProcess } from './processes'
import { panel } from './store'
import { field, primaryBtn, secondaryBtn, textBtn } from './ui'

type Stage = { kind: 'loading' } | { kind: 'question'; index: number } | { kind: 'teachback' } | { kind: 'correcting' } | { kind: 'done' }

/** Helpy's follow-up questions after a recording: one at a time, spoken when the agent runs, typed otherwise. */
export function QuestionsView({ processId }: { processId: string }) {
  const process = useProcess(processId)
  const save = useMutation(api.workMaps.save)
  const voiceOn = useVoice((s) => s.mode === 'debrief')
  const [gaps, setGaps] = useState<Gap[]>([])
  const [example, setExample] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'loading' })
  const [answer, setAnswer] = useState('')
  const [heard, setHeard] = useState<string | null>(null)
  const [correction, setCorrection] = useState('')
  const started = useRef(false)

  const wm = process?.workMap ?? null
  const sessionId = process?.sessionId ?? null
  const summary = useMemo(() => (wm ? teachbackText(wm) : ''), [wm])

  useEffect(() => {
    if (!sessionId || started.current) return
    started.current = true
    panel.setActivity({ kind: 'questions', processId })
    void startVoice('debrief')
    void loadGaps(sessionId).then((r) => {
      setGaps(r.gaps)
      setExample(r.example)
      setStage({ kind: 'question', index: 0 })
    })
  }, [sessionId, processId])

  const gap = stage.kind === 'question' ? gaps[stage.index] : undefined

  // Spoken debrief: the agent asks and waits for the answer; the panel shows what it heard.
  useEffect(() => {
    if (!gap || !voiceOn) return
    let alive = true
    setHeard(null)
    void askAloud(gap.question).then((text) => alive && text && setHeard(text))
    return () => {
      alive = false
    }
  }, [gap, voiceOn])

  useEffect(() => {
    if (gap && !voiceOn) {
      mascot.setState('speaking')
      mascot.bubble(gap.question)
    }
  }, [gap, voiceOn])

  useEffect(() => {
    if (stage.kind !== 'teachback' || !voiceOn) return
    void teachBackAloud(summary).then((r) => r && finish(r.confirmed, r.correction))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.kind, voiceOn])

  if (process === undefined || stage.kind === 'loading') return <p className="m-0 text-[16px] text-muted">One moment…</p>
  if (!wm || !sessionId) return <p className="m-0 text-[16px] text-muted">I have no questions here yet.</p>

  const next = () => {
    if (stage.kind !== 'question' || !gap) return
    const text = answer.trim()
    if (text) emitEvent({ source: 'system', kind: 'answer_given', speaker: 'expert', text, meta: { phase: 'debrief', gapId: gap.id } })
    setAnswer('')
    setStage(stage.index + 1 < gaps.length ? { kind: 'question', index: stage.index + 1 } : { kind: 'teachback' })
  }

  function finish(confirmed: boolean, note?: string) {
    if (!wm || !sessionId) return
    const corrections = [...(wm.teachback?.corrections ?? []), ...(note ? [{ text: note, t: 0, speaker: 'expert' as const }] : [])]
    const updated: WorkMap = { ...wm, teachback: { text: summary, confirmed: true, corrections } }
    if (!process?.example) void save({ sessionId, workMap: updated })
    if (!voiceOn) emitEvent({ source: 'system', kind: 'teachback_result', speaker: 'expert', text: note, meta: { confirmed } })
    void stopVoice()
    panel.setActivity(null)
    mascot.setState('speaking')
    mascot.bubble(confirmed ? 'Thank you, Sabine. Now I can teach it.' : 'Thank you, I changed it the way you said.', { ttlMs: 6000 })
    setStage({ kind: 'done' })
  }

  if (stage.kind === 'question' && gap) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[14px] text-muted">
          Question {stage.index + 1} of {gaps.length}
          {example ? ' · example' : ''}
        </p>
        {!example ? <ClipPlayer sessionId={sessionId} start={gap.clip.start} end={gap.clip.end} className="w-full" /> : null}
        <p className="m-0 text-[19px] font-semibold leading-snug text-ink">{gap.question}</p>
        {voiceOn ? (
          <p className="m-0 rounded-xl bg-rule-soft px-4 py-3 text-[16px] text-ink">{heard ? `“${heard}”` : 'Just answer out loud. I’m listening.'}</p>
        ) : (
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Type your answer…" className={`${field} py-3 leading-snug`} aria-label="Your answer" />
        )}
        <button type="button" className={primaryBtn} onClick={next}>
          {stage.index + 1 < gaps.length ? 'Next question' : 'Done'}
        </button>
      </div>
    )
  }

  if (stage.kind === 'teachback' || stage.kind === 'correcting') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-ink">Did I get it right?</h2>
        <ol className="m-0 list-none space-y-2.5 p-0">
          {[...wm.steps]
            .sort((a, b) => a.index - b.index)
            .map((s, i) => (
              <li key={s.id} className="flex gap-3 text-[16px] leading-snug text-ink">
                <span className="w-5 shrink-0 font-semibold tabular-nums text-faint">{i + 1}</span>
                <span>
                  {s.title}
                  {s.isJudgmentCall && s.reason ? <span className="mt-0.5 block font-quote text-[16px] italic text-muted">because “{s.reason.text}”</span> : null}
                </span>
              </li>
            ))}
        </ol>
        {stage.kind === 'teachback' ? (
          <>
            <button type="button" className={primaryBtn} onClick={() => finish(true)}>
              Yes, that’s how it works
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setStage({ kind: 'correcting' })}>
              Something is not right
            </button>
          </>
        ) : (
          <>
            <textarea autoFocus value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} placeholder="What should I change?" className={`${field} py-3`} aria-label="Correction" />
            <button type="button" className={primaryBtn} disabled={!correction.trim()} onClick={() => finish(false, correction.trim())}>
              Save my correction
            </button>
            <button type="button" className={textBtn} onClick={() => setStage({ kind: 'teachback' })}>
              Back
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[20px] font-semibold tracking-tight text-ink">Thank you!</h2>
      <p className="m-0 text-[16px] text-muted">Your team can learn this from me now.</p>
      <button type="button" className={secondaryBtn} onClick={() => panel.show({ name: 'process', processId })}>
        See what I learned
      </button>
    </div>
  )
}
