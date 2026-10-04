import { useEffect } from 'react'
import { erp } from '../erp/store'
import { mascot } from '../mascot'
import { bus, emitEvent } from '../shared/bus'
import { mascot as shared } from '../shared/mascot'
import { session } from '../shared/session'
import type { AppEvent, Guardrail } from '../shared/types'
import { learningGuide } from './learningGuide'
import { explainIntervention, guardrailMet } from './model'

const momentAction = (stepId?: string) => (stepId ? [{ label: 'Show me Sabine’s screen', primary: true, onClick: () => shared.showExpertClip(stepId) }] : [])

/**
 * Guides a new hire through a practice case: Helpy leads (learningGuide says every step of Sabine's process,
 * out loud and in its bubble, while it points at it, and moves on once the step is done); for judgment calls it
 * asks instead of telling. Before a rule is broken it turns red, points at the field and asks why Sabine would stop.
 * The voice tutor (P2) answers the trainee's questions on top; its words replace the bubble while it speaks.
 */
export function TeachLayer({ onCaseDone }: { onCaseDone?: () => void }) {
  useEffect(() => {
    let pendingFix: { invoiceId: string; guardrail: Guardrail } | null = null
    let lastViolationAt = 0
    // Teach started without "Teach me this" (e.g. from the debrief window): the guide leads from here.
    const wm = session().workMap
    if (!learningGuide.isActive() && wm) {
      learningGuide.begin(wm)
      learningGuide.ready()
    }
    const finished = (id: string) => erp().invoices[id]?.status !== 'open'

    // Clicking into a field is not doing the step: Helpy moves on once the trainee changed something
    // (field_changed) or leaves the field (checked it, nothing to change), never while a dropdown is open.
    const onLeaveField = (e: FocusEvent) => {
      const id = erp().openId
      const invoice = id ? erp().invoices[id] : undefined
      if (!id || !invoice?.teachOnly || finished(id) || pendingFix || !(e.target instanceof Element) || !e.target.closest('[data-target]')) return
      learningGuide.update(600)
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
        const target = e.targetId ?? null
        const explain = () => {
          const text = explainIntervention(wm, g)
          learningGuide.say(text, target, { tone: 'alert', actions: momentAction(g.stepId), context: `[GUIDE] Helpy explained the rule to the trainee: "${text}"` })
          emitEvent({ source: 'system', kind: 'tutor_intervention', invoiceId: e.invoiceId, text: g.quote.text, meta: { guardrailId: g.id, stepId: g.stepId, action: 'explained' } })
        }
        if (again) return explain()
        // First ask (the trainee thinks), then explain with Sabine's reason.
        const ask = `${wm.expert} would stop here. Why do you think?`
        learningGuide.say(ask, target, {
          tone: 'alert',
          actions: [{ label: 'Tell me why', primary: true, onClick: explain }, ...momentAction(g.stepId).map((a) => ({ ...a, primary: false }))],
          // The tutor heard nothing yet: it waits for the trainee's reason, then explains (see tutor.md, [INTERVENE]).
          context:
            `[INTERVENE] Helpy just asked the trainee "${ask}" ${e.meta?.stage === 'decision' ? 'The trainee just made this decision' : 'The trainee tried to post'}, ` +
            `which breaks guardrail ${g.id}: ${g.text}. Expert quote: "${g.quote.text}". Step: ${g.stepId ?? '?'}. Invoice: ${e.invoiceId}.`,
        })
        emitEvent({ source: 'system', kind: 'tutor_intervention', invoiceId: e.invoiceId, text: g.text, meta: { guardrailId: g.id, stepId: g.stepId, action: 'stopped', stage: e.meta?.stage } })
        return
      }

      if (e.kind === 'sequence_deviation' && e.source === 'system') {
        const step = wm.steps.find((s) => s.id === e.meta?.expectedStepId)
        if (!step || pendingFix) return
        mascot.setState('thinking')
        learningGuide.say(`Wait: ${wm.expert} always does “${step.title}” first.`, step.targetId ?? null)
        return
      }

      if (e.source !== 'dom' || !e.invoiceId) return
      const invoice = erp().invoices[e.invoiceId]
      if (!invoice) return
      if (!invoice.teachOnly) {
        if (e.kind === 'invoice_opened') learningGuide.update(600) // one of Sabine's own: back to the practice case
        return
      }

      if (e.kind === 'invoice_opened') {
        if (invoice.status === 'open') learningGuide.reopened(invoice.id) // practice cases are reset for every new round
        learningGuide.update(600)
        return
      }

      if (e.kind === 'field_changed' && pendingFix?.invoiceId === invoice.id && guardrailMet(invoice, pendingFix.guardrail)) {
        pendingFix = null
        mascot.pose('cheer', 1800)
        learningGuide.say(`That’s it. ${wm.expert} would do the same.`, null)
        learningGuide.repeatStep(2800) // then the step that is next now
        return
      }

      if (e.kind === 'field_changed') {
        if (!pendingFix) learningGuide.update(700)
        return
      }

      if (e.kind === 'action' && e.action) {
        learningGuide.finished(invoice.id)
        pendingFix = null
        // Case done: back to the corner (and the clicked button should not keep Helpy next to it).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        mascot.pose('cheer', 2200)
        learningGuide.say(`Invoice ${invoice.number} is done. Click me to see how you did.`, null)
        onCaseDone?.()
      }
    }

    bus.on('event', onEvent)
    window.addEventListener('focusout', onLeaveField)
    return () => {
      bus.off('event', onEvent)
      window.removeEventListener('focusout', onLeaveField)
    }
  }, [onCaseDone])

  return null
}
