import { bus, emitEvent } from '../shared/bus'
import { session } from '../shared/session'
import type { AppEvent, Step } from '../shared/types'
import { isRelevant } from './guardrails'
import { erp, PREVIEW_TARGET } from './store'

// Teach mode only: which Work Map steps has the trainee done on each invoice?
// A step counts as done once its targetId was touched. Order deviations only ask, never block.

const touched = new Map<string, Set<string>>() // invoiceId → targetIds
const warned = new Set<string>() // `${invoiceId}:${stepId}`, one nudge per skipped step

/** Steps without guardrails always apply; others only when one of their guardrails is relevant to this invoice. */
function applies(step: Step, invoiceId: string): boolean {
  if (step.guardrailIds.length === 0) return true
  const { workMap } = session()
  const invoice = erp().invoices[invoiceId]
  if (!workMap || !invoice) return false
  return workMap.guardrails.filter((g) => step.guardrailIds.includes(g.id)).some((g) => isRelevant(invoice, g))
}

function stepsFor(invoiceId: string): Step[] {
  const steps = session().workMap?.steps ?? []
  return [...steps].sort((a, b) => a.index - b.index).filter((s) => s.targetId && applies(s, invoiceId))
}

export function getNextStep(invoiceId: string): Step | null {
  const done = touched.get(invoiceId) ?? new Set()
  return stepsFor(invoiceId).find((s) => !done.has(s.targetId!)) ?? null
}

function onEvent(e: AppEvent) {
  if (session().mode !== 'teach' || e.source !== 'dom' || !e.invoiceId || !e.targetId) return

  const done = touched.get(e.invoiceId) ?? new Set<string>()
  touched.set(e.invoiceId, done)

  // Opening an invoice shows the document, so "look at the invoice" counts as done.
  if (e.kind === 'invoice_opened') {
    done.add(e.targetId)
    done.add(PREVIEW_TARGET)
    return
  }

  const steps = stepsFor(e.invoiceId)
  const current = steps.find((s) => s.targetId === e.targetId)

  if (current) {
    const skipped = steps.find((s) => s.index < current.index && !done.has(s.targetId!))
    const key = skipped && `${e.invoiceId}:${skipped.id}`
    if (skipped && key && !warned.has(key)) {
      warned.add(key)
      emitEvent({
        source: 'system',
        kind: 'sequence_deviation',
        invoiceId: e.invoiceId,
        targetId: skipped.targetId,
        text: `Skipped "${skipped.title}" before "${current.title}"`,
        meta: { expectedStepId: skipped.id, actualStepId: current.id },
      })
    }
  }

  done.add(e.targetId)
}

/** Mark a target as seen without emitting an event (e.g. the trainee checked a field that was already right). */
export function markTouched(invoiceId: string, targetId: string) {
  const done = touched.get(invoiceId) ?? new Set<string>()
  done.add(targetId)
  touched.set(invoiceId, done)
}

function onFocusIn(e: FocusEvent) {
  const openId = erp().openId
  if (session().mode !== 'teach' || !openId || !(e.target instanceof Element)) return
  const targetId = e.target.closest<HTMLElement>('[data-target]')?.dataset.target
  if (targetId) markTouched(openId, targetId)
}

let installed = false

/** Call once on the client. */
export function installStepTracker() {
  if (installed) return
  installed = true
  bus.on('event', onEvent)
  if (typeof window !== 'undefined') window.addEventListener('focusin', onFocusIn)
}

export function resetStepTracker() {
  touched.clear()
  warned.clear()
}
