import { useEffect } from 'react'
import { getNextStep } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { actionTarget } from '../erp/targetIds'
import { mascot } from '../mascot'
import { bus, emitEvent } from '../shared/bus'
import { mascot as shared } from '../shared/mascot'
import { session } from '../shared/session'
import type { AppEvent, Guardrail } from '../shared/types'
import { explainIntervention, guardrailMet } from './model'

/** Still typing into a field: Helpy waits until the field is left. */
const typing = () => {
  const a = document.activeElement
  return a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !['button', 'submit', 'checkbox', 'radio', 'range'].includes(a.type))
}

const momentAction = (stepId?: string) => (stepId ? [{ label: 'Show me Sabine’s screen', primary: true, onClick: () => shared.showExpertClip(stepId) }] : [])

/**
 * Guides a new hire through a practice case: after every move Helpy points at the next step of
 * Sabine's process and says it; for judgment calls it asks instead of telling. Before a rule is
 * broken it turns red and points at the field. The voice tutor (P2) speaks on top; its words
 * simply replace these bubbles.
 */
export function TeachLayer({ onCaseDone }: { onCaseDone?: () => void }) {
  useEffect(() => {
    let pendingFix: { invoiceId: string; guardrail: Guardrail } | null = null
    let lastViolationAt = 0
    let guideTimer: ReturnType<typeof setTimeout> | undefined
    // Praise for a fix stays readable: the next step is not said before this time.
    let quietUntil = 0
    // Invoices the trainee finished (post, hold, 2nd approval): known at the click, before the ERP saved the new status.
    const done = new Set<string>()
    const finished = (id: string) => done.has(id) || erp().invoices[id]?.status !== 'open'

    /** Point at the next step and say it (judgment calls: ask what Sabine would do). */
    const guide = (invoiceId: string, delay = 700) => {
      clearTimeout(guideTimer)
      guideTimer = setTimeout(() => {
        const wm = session().workMap
        // A posted, held or escalated invoice is done: nothing to guide (its buttons lose focus as they get disabled).
        if (!wm || pendingFix || erp().openId !== invoiceId || finished(invoiceId) || typing()) return
        const step = getNextStep(invoiceId)
        mascot.setState('speaking')
        if (!step?.targetId) {
          mascot.pointTo(actionTarget('post'))
          mascot.bubble(`That’s everything ${wm.expert} checks. Now decide: post it, hold it or ask for a second approval?`, { topic: 'step' })
          return
        }
        mascot.pointTo(step.targetId)
        mascot.bubble(step.isJudgmentCall ? `${step.title}. Your call: what would ${wm.expert} do here?` : `Next: ${step.title}.`, { topic: 'step' })
      }, Math.max(delay, quietUntil - Date.now()))
    }

    // Clicking into a field is not doing the step: Helpy moves on once the trainee changed something
    // (field_changed) or leaves the field (checked it, nothing to change), never while a dropdown is open.
    const onLeaveField = (e: FocusEvent) => {
      const id = erp().openId
      const invoice = id ? erp().invoices[id] : undefined
      if (!id || !invoice?.teachOnly || finished(id) || !(e.target instanceof Element) || !e.target.closest('[data-target]')) return
      guide(id, 600)
    }

    const onEvent = (e: AppEvent) => {
      const wm = session().workMap
      if (session().mode !== 'teach' || !wm) return

      if (e.kind === 'guardrail_violation') {
        if (Date.now() - lastViolationAt < 400) return // several rules on one save: talk about the first
        const g = wm.guardrails.find((x) => x.id === e.meta?.guardrailId)
        if (!g || !e.invoiceId) return
        // Already asked about this rule on this invoice (caught at the decision, now again at Post): explain it.
        const again = pendingFix?.invoiceId === e.invoiceId && pendingFix.guardrail.id === g.id
        lastViolationAt = Date.now()
        pendingFix = { invoiceId: e.invoiceId, guardrail: g }
        clearTimeout(guideTimer)
        const target = e.targetId ?? null
        const explain = () => {
          mascot.alert(target, explainIntervention(wm, g), momentAction(g.stepId))
          emitEvent({ source: 'system', kind: 'tutor_intervention', invoiceId: e.invoiceId, text: g.quote.text, meta: { guardrailId: g.id, stepId: g.stepId, action: 'explained' } })
        }
        if (again) return explain()
        // First ask (the trainee thinks), then explain with Sabine's reason.
        mascot.alert(target, `${wm.expert} would stop here. Why do you think?`, [{ label: 'Tell me why', primary: true, onClick: explain }, ...momentAction(g.stepId).map((a) => ({ ...a, primary: false }))])
        emitEvent({ source: 'system', kind: 'tutor_intervention', invoiceId: e.invoiceId, text: g.text, meta: { guardrailId: g.id, stepId: g.stepId, action: 'stopped', stage: e.meta?.stage } })
        return
      }

      if (e.kind === 'sequence_deviation' && e.source === 'system') {
        const step = wm.steps.find((s) => s.id === e.meta?.expectedStepId)
        if (!step) return
        mascot.setState('thinking')
        mascot.pointTo(step.targetId ?? null)
        mascot.bubble(`${wm.expert} always does “${step.title}” first.`, { topic: 'step' })
        return
      }

      if (e.source !== 'dom' || !e.invoiceId) return
      const invoice = erp().invoices[e.invoiceId]
      if (!invoice?.teachOnly) return

      if (e.kind === 'invoice_opened') {
        if (invoice.status === 'open') done.delete(invoice.id) // practice cases are reset for every new round
        guide(invoice.id, 600)
        return
      }

      if (e.kind === 'field_changed' && pendingFix?.invoiceId === invoice.id && guardrailMet(invoice, pendingFix.guardrail)) {
        pendingFix = null
        mascot.setState('speaking')
        mascot.pointTo(null)
        mascot.pose('cheer', 1800)
        mascot.bubble(`That’s it. ${wm.expert} would do the same.`, { topic: 'step' })
        quietUntil = Date.now() + 2500
        guide(invoice.id, 2500)
        return
      }

      if (e.kind === 'field_changed') {
        guide(invoice.id)
        return
      }

      if (e.kind === 'action' && e.action) {
        done.add(invoice.id)
        clearTimeout(guideTimer)
        // Case done: back to the corner (and the clicked button should not keep Helpy next to it).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        mascot.setState('speaking')
        mascot.pointTo(null)
        mascot.pose('cheer', 2200)
        mascot.bubble(`Invoice ${invoice.number} is done. Click me to see how you did.`, { topic: 'step' })
        onCaseDone?.()
      }
    }

    bus.on('event', onEvent)
    window.addEventListener('focusout', onLeaveField)
    return () => {
      bus.off('event', onEvent)
      window.removeEventListener('focusout', onLeaveField)
      clearTimeout(guideTimer)
    }
  }, [onCaseDone])

  return null
}
