import { getNextStep } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { actionTarget, rowTarget } from '../erp/targetIds'
import { mascot } from '../mascot'
import { emitEvent } from '../shared/bus'
import { session } from '../shared/session'

/** "What's next?": Helpy points at the next step of Sabine's process and says it in her words. */
export function hintNextStep() {
  const wm = session().workMap
  if (!wm) {
    mascot.bubble('I have not learned this process yet. Load Sabine’s Work Map first.', { topic: 'step' })
    return
  }
  const { openId, invoices } = erp()
  if (!openId) {
    const next = Object.values(invoices).find((i) => i.teachOnly && i.status === 'open')
    if (next) {
      mascot.pointTo(rowTarget(next.id))
      mascot.bubble(`Start with invoice ${next.number}. Open it and I’ll walk you through it.`, { topic: 'step' })
    } else mascot.bubble('All cases are done. Nice work!', { topic: 'step' })
    return
  }
  const step = getNextStep(openId)
  if (!step?.targetId) {
    mascot.pointTo(actionTarget('post'))
    mascot.bubble('You did everything Sabine checks on this one. Decide how to finish it.', { topic: 'step' })
    return
  }
  mascot.setState('speaking')
  mascot.pointTo(step.targetId)
  mascot.bubble(step.reason ? `Next: ${step.title}. Sabine says: “${step.reason.text}”` : `Next: ${step.title}.`, { topic: 'step' })
  emitEvent({ source: 'system', kind: 'action', invoiceId: openId, targetId: step.targetId, text: `Hint: ${step.title}`, meta: { action: 'hint_shown', stepId: step.id, invoiceId: openId } })
  setTimeout(() => mascot.setState('idle'), 2500)
}
