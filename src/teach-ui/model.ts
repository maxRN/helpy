// Pure helpers for Teach mode: which steps apply to an invoice, prediction options, the final report.
import { conditionHolds, isRelevant } from '../erp/guardrails'
import type { Invoice } from '../erp/model'
import { PREVIEW_TARGET } from '../erp/targetIds'
import type { AppEvent, Condition, Guardrail, Step, WorkMap } from '../shared/types'

/** Steps the trainee should do on this invoice (same rule as P1's step tracker). */
export function applicableSteps(wm: WorkMap, invoice: Invoice): Step[] {
  return [...wm.steps]
    .sort((a, b) => a.index - b.index)
    .filter((s) => {
      if (!s.targetId) return false
      if (s.guardrailIds.length === 0) return true
      return wm.guardrails.filter((g) => s.guardrailIds.includes(g.id)).some((g) => isRelevant(invoice, g))
    })
}

export const relevantGuardrails = (wm: WorkMap, invoice: Invoice) => wm.guardrails.filter((g) => isRelevant(invoice, g))

export function touchedTargets(events: readonly AppEvent[], invoiceId: string): Set<string> {
  const done = new Set<string>()
  for (const e of events) {
    if (e.invoiceId !== invoiceId || !e.targetId || e.source !== 'dom') continue
    done.add(e.targetId)
    if (e.kind === 'invoice_opened') done.add(PREVIEW_TARGET)
  }
  return done
}

// ---------- prediction card ----------

function actionPhrase(c: Condition): string {
  if (c.field === 'account' && c.op === 'eq' && c.value === 'capex') return 'Book it as capex (cost center 0400)'
  if (c.field === 'assetNumber' && c.op === 'not_empty') return 'Enter the asset number before posting'
  if (c.field === 'status' && c.op === 'eq' && c.value === 'on_hold') return 'Put it on hold'
  if (c.field === 'status' && c.op === 'in') return 'Hold it and ask the controller'
  if (c.field === 'approvalRequested' && c.value === true) return 'Request a 2nd approval'
  return `Make sure the ${c.field} is right before posting`
}

const DISTRACTORS = ['Post it as it is', 'Put it on hold', 'Request a 2nd approval', 'Keep it on opex (4711)']

export interface Prediction {
  guardrail: Guardrail
  options: { label: string; correct: boolean }[]
}

/** "What would Sabine do here?" with the rule's answer and two plausible wrong ones, in a stable order. */
export function predictionFor(g: Guardrail): Prediction {
  const correct = actionPhrase(g.require[0] ?? { field: 'status', op: 'eq', value: 'on_hold' })
  const wrong = DISTRACTORS.filter((d) => d !== correct && !(correct.includes('hold') && d.includes('hold'))).slice(0, 2)
  const options = [{ label: correct, correct: true }, ...wrong.map((label) => ({ label, correct: false }))]
  const shift = g.id.charCodeAt(g.id.length - 1) % options.length
  return { guardrail: g, options: [...options.slice(shift), ...options.slice(0, shift)] }
}

// ---------- intervention ----------

/**
 * What Helpy says after "Sabine would stop here. Why do you think?": the rule in the expert's own
 * words (the reason she gave), what the rule is, and what to do instead.
 */
export function explainIntervention(wm: WorkMap, g: Guardrail): string {
  const fix = g.require[0] ? actionPhrase(g.require[0]) : 'Fix it'
  return `${wm.expert} said: “${g.quote.text}” ${g.text.replace(/\.?$/, '.')} ${fix.replace(/\.?$/, '.')}`
}

// ---------- report ----------

export type Outcome = 'mastered' | 'with_help' | 'caught' | 'not_reached'

export interface StepResult {
  step: Step
  outcome: Outcome
  detail?: string
}

export interface CaseResult {
  invoice: Invoice
  steps: StepResult[]
}

export interface TeachReport {
  cases: CaseResult[]
  counts: Record<Outcome, number>
  practice: StepResult[]
}

const meta = (e: AppEvent, key: string) => (e.meta?.[key] as string | undefined) ?? undefined

/** Builds the report from the AppEvents of the Teach run: what sits, what needed help, which mistakes were caught. */
export function buildReport(wm: WorkMap, invoices: Invoice[], events: readonly AppEvent[]): TeachReport {
  const worked = invoices.filter((inv) => inv.teachOnly && events.some((e) => e.invoiceId === inv.id && e.source === 'dom'))
  const cases: CaseResult[] = worked.map((invoice) => {
    const mine = events.filter((e) => e.invoiceId === invoice.id || meta(e, 'invoiceId') === invoice.id)
    const touched = touchedTargets(mine, invoice.id)
    const steps = applicableSteps(wm, invoice).map((step): StepResult => {
      const caught = mine.find(
        (e) => e.kind === 'guardrail_violation' && (meta(e, 'stepId') === step.id || step.guardrailIds.includes(meta(e, 'guardrailId') ?? '')),
      )
      if (caught) return { step, outcome: 'caught', detail: caught.text }
      const helped = mine.find(
        (e) =>
          (e.kind === 'sequence_deviation' && meta(e, 'expectedStepId') === step.id) ||
          (e.meta?.action === 'hint_shown' && meta(e, 'stepId') === step.id) ||
          (e.meta?.action === 'prediction' && e.meta?.outcome === 'off' && step.guardrailIds.includes(meta(e, 'guardrailId') ?? '')),
      )
      if (helped) return { step, outcome: 'with_help', detail: helped.kind === 'sequence_deviation' ? 'Skipped at first' : helped.meta?.action === 'prediction' ? 'Predicted it wrong' : 'Asked Helpy' }
      if (step.targetId && touched.has(step.targetId)) return { step, outcome: 'mastered' }
      return { step, outcome: 'not_reached' }
    })
    return { invoice, steps }
  })

  const counts: Record<Outcome, number> = { mastered: 0, with_help: 0, caught: 0, not_reached: 0 }
  const practice = new Map<string, StepResult>()
  for (const c of cases)
    for (const r of c.steps) {
      counts[r.outcome]++
      if ((r.outcome === 'caught' || r.outcome === 'with_help') && !practice.has(r.step.id)) practice.set(r.step.id, r)
    }
  return { cases, counts, practice: [...practice.values()] }
}

/** True once every `require` of the guardrail holds again (the trainee fixed it). */
export const guardrailMet = (invoice: Invoice, g: Guardrail) => !isRelevant(invoice, g) || g.require.every((c) => conditionHolds(invoice, c))
