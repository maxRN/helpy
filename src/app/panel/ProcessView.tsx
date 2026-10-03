import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { FIXTURE_WORKMAP } from '../../erp/fixtures'
import { mascot } from '../../mascot'
import { registry } from '../../shared/registry'
import type { Step, WorkMap } from '../../shared/types'
import { describeGuardrailLogic } from '../../workmap/conditions'
import { downloadWorkMapMarkdown } from '../../workmap/exportMarkdown'
import { startLearning } from './learning'
import { STATUS, statusOf, useProcess, type Process } from './processes'
import { panel } from './store'
import { primaryBtn, secondaryBtn, textBtn } from './ui'

function StepItem({ wm, step, processId }: { wm: WorkMap; step: Step; processId: string }) {
  const [open, setOpen] = useState(false)
  const rules = wm.guardrails.filter((g) => step.guardrailIds.includes(g.id))
  const onScreen = !!step.targetId && !!registry.get(step.targetId)
  return (
    <li className="border-t border-helpy-line first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 py-3 text-left">
        <span className="w-5 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums text-faint">{step.index}</span>
        <span className="min-w-0 flex-1 text-[16px] leading-snug text-ink">
          {step.title}
          {step.isJudgmentCall ? <span className="ml-2 text-[13px] font-medium text-helpy">her judgment</span> : null}
        </span>
        <span className={`pt-0.5 text-[16px] text-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      {open ? (
        <div className="pb-4 pl-8">
          <p className="m-0 text-[15px] text-muted">{step.decision}.</p>
          {step.reason ? <p className="m-0 mt-2 font-quote text-[18px] italic leading-snug text-ink">“{step.reason.text}”</p> : null}
          {rules.map((g) => (
            <p key={g.id} className={`m-0 mt-2 rounded-lg px-3 py-2 text-[14px] ${g.severity === 'block' ? 'bg-guard-soft text-guard' : 'bg-ask-soft text-ask'}`}>
              <span className="font-semibold">{g.severity === 'block' ? 'Always stop' : 'Ask first'}:</span> {g.text}
              <span className="mt-0.5 block text-[13px] opacity-80">When {describeGuardrailLogic(g).when}.</span>
            </p>
          ))}
          <div className="mt-2 flex flex-wrap gap-1">
            {onScreen ? (
              <button
                type="button"
                className={textBtn}
                onClick={() => {
                  panel.close()
                  mascot.pointTo(step.targetId ?? null)
                  mascot.bubble(step.title, { ttlMs: 5000 })
                }}
              >
                Show me where
              </button>
            ) : null}
            <button type="button" className={textBtn} onClick={() => panel.show({ name: 'moment', stepId: step.id, processId })}>
              Sabine’s screen
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** Shown right after a recording, until P3's pipeline has written the Work Map. */
function StillWriting({ process }: { process: Process }) {
  const save = useMutation(api.workMaps.save)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="rounded-xl bg-rule-soft p-4" aria-live="polite">
      <p className="m-0 flex items-center gap-2 text-[16px] font-medium text-ink">
        <span className="size-2 animate-pulse rounded-full bg-helpy" aria-hidden />
        I’m still writing it down.
      </p>
      <p className="m-0 mt-1 text-[15px] text-muted">This takes about a minute. You can keep working.</p>
      {late && process.sessionId ? (
        <button
          type="button"
          className={`${textBtn} mt-1 -ml-2`}
          onClick={() => {
            const sessionId = process.sessionId!
            void save({ sessionId, workMap: { ...FIXTURE_WORKMAP, sessionId, task: process.name, teachback: { text: '', confirmed: false, corrections: [] } } })
          }}
        >
          Use the example for now
        </button>
      ) : null}
    </div>
  )
}

/** One process: the steps in Sabine's words, and the way to learn it. */
export function ProcessView({ processId }: { processId: string }) {
  const process = useProcess(processId)
  if (process === undefined) return <p className="m-0 text-[16px] text-muted">Loading…</p>
  if (process === null) return <p className="m-0 text-[16px] text-muted">I can’t find this process anymore.</p>

  const wm = process.workMap
  const status = statusOf(process)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 text-[21px] font-semibold leading-tight tracking-tight text-ink [text-wrap:balance]">{process.name}</h2>
        <p className="m-0 mt-1.5 text-[15px] text-muted">
          {wm ? `Learned from ${wm.expert} · ${wm.steps.length} steps · ${wm.guardrails.length} rules · ` : ''}
          <span className={STATUS[status].tone}>{STATUS[status].label}</span>
        </p>
      </div>

      {status === 'not_recorded' ? (
        <button type="button" className={primaryBtn} onClick={() => panel.show({ name: 'record' })}>
          Record it
        </button>
      ) : null}
      {status === 'processing' ? <StillWriting process={process} /> : null}

      {wm ? (
        <div className="flex flex-col gap-2">
          <button type="button" className={primaryBtn} onClick={() => void startLearning(process)}>
            Teach me this
          </button>
          {status === 'questions' && !process.example ? (
            <button type="button" className={secondaryBtn} onClick={() => panel.show({ name: 'questions', processId: process.id })}>
              Answer my questions
            </button>
          ) : null}
        </div>
      ) : null}

      {wm ? (
        <div>
          <h3 className="m-0 text-[15px] font-semibold text-ink">The steps</h3>
          <ol className="m-0 mt-1 list-none p-0">
            {[...wm.steps]
              .sort((a, b) => a.index - b.index)
              .map((s) => (
                <StepItem key={s.id} wm={wm} step={s} processId={process.id} />
              ))}
          </ol>
          <button type="button" className={`${textBtn} mt-2 -ml-2 text-muted`} onClick={() => downloadWorkMapMarkdown(wm)}>
            Export for AI agents
          </button>
        </div>
      ) : null}
    </div>
  )
}
