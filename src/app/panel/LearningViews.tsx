import { useEffect, useMemo, useState } from 'react'
import { getNextStep } from '../../erp/stepTracker'
import { useErp } from '../../erp/store'
import { bus, getEventLog } from '../../shared/bus'
import { useSession } from '../../shared/session'
import { hintNextStep } from '../../teach-ui/hint'
import { buildReport, type Outcome } from '../../teach-ui/model'
import { EnlargeableClip } from '../player/EnlargeableClip'
import { useVoice } from '../voice'
import { stopLearning } from './learning'
import { useProcess } from './processes'
import { panel } from './store'
import { mmss, primaryBtn, secondaryBtn, textBtn } from './ui'

function useBusTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    bus.on('event', bump)
    return () => bus.off('event', bump)
  }, [])
}

/** While practicing: what comes next, a hint on demand, progress, stop. */
export function LearningView() {
  useBusTick()
  const wm = useSession((s) => s.workMap)
  const invoice = useErp((s) => (s.openId ? s.invoices[s.openId] : null))
  const voiceOn = useVoice((s) => s.mode === 'teach')
  const next = invoice ? getNextStep(invoice.id) : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="m-0 text-[14px] text-muted">Practicing{wm ? ` · learned from ${wm.expert}` : ''}</p>
        <p className="m-0 mt-1 text-[18px] font-semibold leading-snug text-ink">
          {invoice ? (next ? `Next: ${next.title}` : `Invoice ${invoice.number}: decide how to finish it`) : 'Open one of the new invoices'}
        </p>
        {voiceOn ? <p className="m-0 mt-1 text-[15px] text-muted">You can also just ask me out loud.</p> : null}
      </div>
      <button
        type="button"
        className={primaryBtn}
        onClick={() => {
          panel.close()
          hintNextStep()
        }}
      >
        What do I do next?
      </button>
      <button type="button" className={secondaryBtn} onClick={() => panel.show({ name: 'report' })}>
        How am I doing?
      </button>
      <button type="button" className={textBtn} onClick={() => void stopLearning().then(() => panel.show({ name: 'home' }))}>
        Stop practicing
      </button>
    </div>
  )
}

const OUTCOME: Record<Outcome, { label: string; tone: string }> = {
  mastered: { label: 'On your own', tone: 'text-helpy' },
  with_help: { label: 'With a hint', tone: 'text-ask' },
  caught: { label: 'Mistake caught', tone: 'text-guard' },
  not_reached: { label: 'Not done yet', tone: 'text-faint' },
}

/** What sits, what needed help, which mistakes were caught, and what to practice next. */
export function ReportView() {
  useBusTick()
  const wm = useSession((s) => s.workMap)
  const invoices = useErp((s) => s.invoices)
  const report = useMemo(() => (wm ? buildReport(wm, Object.values(invoices), getEventLog()) : null), [wm, invoices])
  if (!wm || !report) return <p className="m-0 text-[16px] text-muted">Start practicing first.</p>
  const total = report.counts.mastered + report.counts.with_help + report.counts.caught + report.counts.not_reached

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[20px] font-semibold leading-snug tracking-tight text-ink">
        {total === 0 ? 'Nothing done yet' : `${report.counts.mastered} of ${total} steps on your own`}
      </h2>
      {report.cases.map((c) => (
        <div key={c.invoice.id}>
          <p className="m-0 text-[15px] font-medium text-ink">Invoice {c.invoice.number}</p>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {c.steps.map((r) => (
              <li key={r.step.id} className="flex gap-3 text-[15px] leading-snug">
                <span className={`w-28 shrink-0 font-medium ${OUTCOME[r.outcome].tone}`}>{OUTCOME[r.outcome].label}</span>
                <span className="text-ink">{r.step.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {report.practice.length ? (
        <div className="rounded-xl bg-rule-soft p-4">
          <p className="m-0 text-[15px] font-semibold text-ink">Practice next</p>
          <ul className="m-0 mt-1 list-none space-y-2 p-0">
            {report.practice.map((r) => (
              <li key={r.step.id} className="text-[15px] text-ink">
                {r.step.title}
                {r.step.reason ? <span className="block font-quote text-[16px] italic text-muted">“{r.step.reason.text}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" className={secondaryBtn} onClick={() => panel.show({ name: 'learning' })}>
        Back
      </button>
    </div>
  )
}

/** Sabine's screen at a step, with her words: asked for by the tutor (show_expert_clip) or from the step list. */
export function MomentView({ stepId, processId }: { stepId: string; processId?: string }) {
  const process = useProcess(processId ?? null)
  const sessionMap = useSession((s) => s.workMap)
  const wm = processId ? process?.workMap : sessionMap
  const step = wm?.steps.find((s) => s.id === stepId)
  if (!wm || !step) return <p className="m-0 text-[16px] text-muted">I can’t find this moment.</p>
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="m-0 text-[14px] text-muted">
          {wm.expert}’s screen · {mmss(step.clip.start)}
        </p>
        <p className="m-0 mt-1 text-[18px] font-semibold leading-snug text-ink">{step.title}</p>
      </div>
      <EnlargeableClip sessionId={wm.sessionId} start={step.clip.start} end={step.clip.end} title={`${wm.expert}’s screen · ${step.title}`} />
      {step.reason ? <p className="m-0 border-l-2 border-helpy pl-3 font-quote text-[19px] italic leading-snug text-ink">“{step.reason.text}”</p> : null}
    </div>
  )
}
