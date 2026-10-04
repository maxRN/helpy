import { registry } from '../../shared/registry'
import type { Guardrail, Step, WorkMap } from '../../shared/types'
import { describeGuardrailLogic } from '../../workmap/conditions'
import { useProcess } from '../panel/processes'
import { mmss } from '../panel/ui'
import { EnlargeableClip } from '../player/EnlargeableClip'
import { showWhere, teach } from './actions'
import { helpyApp } from './store'
import { appPrimary, appSecondary, card, pageTitle, sectionTitle } from './ui'

/**
 * The step's rules as a decision tree: one question per rule ("Is the amount over $5,000?"),
 * yes leads to what the rule demands, no to the next question; if no rule applies, the usual way.
 */
function DecisionTree({ wm, step, rules, next }: { wm: WorkMap; step: Step; rules: Guardrail[]; next: Step | null }) {
  const then = next ? `Then step ${next.index}: ${next.title}.` : 'That was the last step.'
  return (
    <ol className="m-0 list-none p-0">
      {rules.map((g) => {
        const logic = describeGuardrailLogic(g)
        const stop = g.severity === 'block'
        return (
          <li key={g.id} className="relative pb-5 pl-9">
            <span className="absolute top-0 bottom-0 left-[13px] w-0.5 bg-helpy-line" aria-hidden />
            <span className="absolute top-3 left-0 flex size-7 items-center justify-center rounded-full bg-white text-[15px] font-bold text-muted ring-2 ring-helpy-line" aria-hidden>
              ?
            </span>
            <p className="m-0 rounded-xl border border-helpy-line bg-white px-4 py-3 text-[17px] font-medium leading-snug text-ink">
              {g.when.length ? `Is it true that ${logic.when}?` : 'For every invoice at this step:'}
            </p>
            <div className="mt-2 flex items-start gap-2 pl-4">
              <span className="mt-2.5 shrink-0 text-[15px] font-semibold text-ink">{g.when.length ? 'Yes →' : '→'}</span>
              <div className={`min-w-0 flex-1 rounded-xl px-4 py-3 ${stop ? 'bg-guard-soft' : 'bg-ask-soft'}`}>
                <p className={`m-0 text-[16px] font-semibold leading-snug ${stop ? 'text-guard' : 'text-ask'}`}>
                  {stop ? 'Stop' : 'Ask first'}: {g.text}
                </p>
                {logic.require ? <p className="m-0 mt-1 text-[15px] text-ink">It has to be: {logic.require}.</p> : null}
                <p className="m-0 mt-2 font-quote text-[17px] italic leading-snug text-ink">
                  “{g.quote.text}” <span className="font-helpy text-[14px] not-italic text-muted">— {wm.expert}</span>
                </p>
              </div>
            </div>
            {g.when.length ? <p className="m-0 mt-2 pl-4 text-[15px] font-semibold text-muted">No ↓</p> : null}
          </li>
        )
      })}
      <li className="relative pl-9">
        <span className="absolute top-3 left-0 flex size-7 items-center justify-center rounded-full bg-helpy text-[14px] font-bold text-white" aria-hidden>
          ✓
        </span>
        <div className="rounded-xl bg-helpy-soft px-4 py-3">
          <p className="m-0 text-[16px] font-semibold text-helpy">{rules.length ? 'If no rule applies' : 'What to do'}</p>
          {/* The decision is what the expert did in the recorded case; for a judgment call that is one example, not the rule. */}
          <p className="m-0 mt-1 text-[16px] leading-snug text-ink">
            {step.isJudgmentCall ? `It depends on the case. In ${wm.expert}’s recording: ${step.decision}.` : `${step.decision}.`}
          </p>
          <p className="m-0 mt-1 text-[15px] text-muted">{then}</p>
        </div>
      </li>
    </ol>
  )
}

/** One step as a concrete guide: what to do, why, the decision tree, and the expert's screen at that moment. */
export function StepPage({ processId, stepId }: { processId: string; stepId: string }) {
  const process = useProcess(processId)
  if (process === undefined) return <p className="m-0 text-[17px] text-muted">Loading…</p>
  const wm = process?.workMap
  const steps = wm ? [...wm.steps].sort((a, b) => a.index - b.index) : []
  const at = steps.findIndex((s) => s.id === stepId)
  const step = steps[at]
  if (!process || !wm || !step) return <p className="m-0 text-[17px] text-muted">I can’t find this step anymore.</p>

  const prev = steps[at - 1] ?? null
  const next = steps[at + 1] ?? null
  const rules = wm.guardrails.filter((g) => step.guardrailIds.includes(g.id))
  const onScreen = !!step.targetId && !!registry.get(step.targetId)
  const go = (s: Step) => helpyApp.go({ name: 'step', processId, stepId: s.id })

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <header>
          <p className="m-0 text-[15px] font-medium text-helpy">
            Step {step.index} of {steps.length}
          </p>
          <h1 className={`${pageTitle} mt-1`}>{step.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={appPrimary} onClick={() => teach(process)}>
              Teach me this
            </button>
            {onScreen ? (
              <button type="button" className={appSecondary} onClick={() => showWhere(step.targetId!, step.title)}>
                Show me where
              </button>
            ) : null}
          </div>
        </header>

        <section className={card}>
          <h2 className={sectionTitle}>What to do</h2>
          <p className="m-0 mt-2 text-[17px] leading-snug text-ink">{step.decision}.</p>
          {step.isJudgmentCall ? (
            <p className="m-0 mt-3 rounded-xl bg-helpy-soft px-4 py-3 text-[16px] leading-snug text-ink">
              This is {wm.expert}’s judgment: it depends on the case. When you practice, Helpy asks you what {wm.expert} would do.
            </p>
          ) : null}
          {step.reason ? (
            <p className="m-0 mt-4 border-l-2 border-helpy pl-3 font-quote text-[19px] italic leading-snug text-ink">
              “{step.reason.text}” <span className="font-helpy text-[14px] not-italic text-muted">— {wm.expert}</span>
            </p>
          ) : null}
        </section>

        <section>
          <h2 className={sectionTitle}>Decision tree</h2>
          <p className="m-0 mt-1 text-[15px] text-muted">Go from top to bottom. The first “yes” decides.</p>
          <div className="mt-4">
            <DecisionTree wm={wm} step={step} rules={rules} next={next} />
          </div>
        </section>

        <nav className="flex flex-wrap justify-between gap-2 border-t border-helpy-line pt-4" aria-label="Steps">
          {prev ? (
            <button type="button" className={appSecondary} onClick={() => go(prev)}>
              ‹ Step {prev.index}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button type="button" className={appSecondary} onClick={() => go(next)}>
              Step {next.index} ›
            </button>
          ) : null}
        </nav>
      </div>

      <aside className="flex flex-col gap-3">
        <h2 className={sectionTitle}>{wm.expert}’s screen</h2>
        <EnlargeableClip sessionId={wm.sessionId} start={step.clip.start} end={step.clip.end} title={`${wm.expert}’s screen · ${step.title}`} />
        <p className="m-0 text-[14px] text-muted">At {mmss(step.clip.start)} in the recording.</p>
      </aside>
    </div>
  )
}
