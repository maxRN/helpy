import { erp } from '../../erp/store'
import { startTeach } from '../../erp/teach'
import { rowTarget } from '../../erp/targetIds'
import { mascot } from '../../mascot'
import { session } from '../../shared/session'
import { resetPracticeCases } from '../../teach-ui/practice'
import { startVoice, stopVoice } from '../voice'
import type { Process } from './processes'
import { panel } from './store'

/**
 * "Teach me this": fresh practice cases in the ERP, the rules compiled from Sabine's words,
 * then the tutor talks and points. Without voice, Helpy points and writes in its bubble.
 */
export async function startLearning(p: Process) {
  if (!p.workMap) return
  panel.setActivity({ kind: 'learning', processId: p.id })
  panel.close()
  mascot.setState('thinking')
  mascot.bubble('One moment, I’m getting a case ready for you…')
  resetPracticeCases()
  await startTeach(p.workMap)
  const first = Object.values(erp().invoices).find((i) => i.teachOnly && i.status === 'open')
  mascot.setState('speaking')
  if (first) mascot.pointTo(rowTarget(first.id))
  mascot.bubble(
    first
      ? `Let’s do a case ${p.workMap.expert} never showed you. Open invoice ${first.number}, I’ll tell you what to do.`
      : `I learned this from ${p.workMap.expert}. Click me whenever you need help.`,
    { ttlMs: 12_000 },
  )
  void startVoice('teach')
}

export async function stopLearning() {
  await stopVoice()
  panel.setActivity(null)
  session().setMode('capture')
  erp().open(null)
  mascot.reset()
}
