import { useEffect } from 'react'
import { getNextStep } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { actionTarget } from '../erp/targetIds'
import { mascot } from '../mascot'
import { bus } from '../shared/bus'
import { mascot as shared } from '../shared/mascot'
import { session } from '../shared/session'
import type { AppEvent, Guardrail } from '../shared/types'
import { guardrailMet } from './model'

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

    /** Point at the next step and say it (judgment calls: ask what Sabine would do). */
    const guide = (invoiceId: string, delay = 700) => {
      clearTimeout(guideTimer)
      guideTimer = setTimeout(() => {
        const wm = session().workMap
        if (!wm || pendingFix || erp().openId !== invoiceId) return
        const step = getNextStep(invoiceId)
        mascot.setState('speaking')
        if (!step?.targetId) {
          mascot.pointTo(actionTarget('post'))
          mascot.bubble(`That’s everything ${wm.expert} checks. Now decide: post it, hold it or ask for a second approval?`, { ttlMs: 12_000 })
          return
        }
        mascot.pointTo(step.targetId)
        mascot.bubble(step.isJudgmentCall ? `${step.title}. Your call: what would ${wm.expert} do here?` : `Next: ${step.title}.`, { ttlMs: 12_000 })
      }, delay)
    }

    const onFocus = () => {
      const id = erp().openId
      if (id && erp().invoices[id]?.teachOnly) guide(id, 900)
    }

    const onEvent = (e: AppEvent) => {
      const wm = session().workMap
      if (session().mode !== 'teach' || !wm) return

      if (e.kind === 'guardrail_violation') {
        if (Date.now() - lastViolationAt < 400) return // several rules on one save: talk about the first
        lastViolationAt = Date.now()
        const g = wm.guardrails.find((x) => x.id === e.meta?.guardrailId)
        if (!g || !e.invoiceId) return
        pendingFix = { invoiceId: e.invoiceId, guardrail: g }
        clearTimeout(guideTimer)
        mascot.alert(e.targetId ?? null, `${wm.expert} would stop here. Why do you think?`, momentAction(g.stepId))
        return
      }

      if (e.kind === 'sequence_deviation' && e.source === 'system') {
        const step = wm.steps.find((s) => s.id === e.meta?.expectedStepId)
        if (!step) return
        mascot.setState('thinking')
        mascot.pointTo(step.targetId ?? null)
        mascot.bubble(`${wm.expert} always does “${step.title}” first.`, { ttlMs: 8000 })
        return
      }

      if (e.source !== 'dom' || !e.invoiceId) return
      const invoice = erp().invoices[e.invoiceId]
      if (!invoice?.teachOnly) return

      if (e.kind === 'invoice_opened') {
        guide(invoice.id, 600)
        return
      }

      if (e.kind === 'field_changed' && pendingFix?.invoiceId === invoice.id && guardrailMet(invoice, pendingFix.guardrail)) {
        pendingFix = null
        mascot.setState('speaking')
        mascot.pointTo(null)
        mascot.bubble(`That’s it. ${wm.expert} would do the same.`, { ttlMs: 5000 })
        guide(invoice.id, 2500)
        return
      }

      if (e.kind === 'field_changed') {
        guide(invoice.id)
        return
      }

      if (e.kind === 'action' && e.action) {
        clearTimeout(guideTimer)
        mascot.setState('speaking')
        mascot.pointTo(null)
        mascot.bubble(`Invoice ${invoice.number} is done. Click me to see how you did.`, { ttlMs: 10_000 })
        onCaseDone?.()
      }
    }

    bus.on('event', onEvent)
    window.addEventListener('focusin', onFocus)
    return () => {
      bus.off('event', onEvent)
      window.removeEventListener('focusin', onFocus)
      clearTimeout(guideTimer)
    }
  }, [onCaseDone])

  return null
}
