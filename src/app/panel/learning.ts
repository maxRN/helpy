import { erp } from '../../erp/store'
import { startTeach } from '../../erp/teach'
import { mascot } from '../../mascot'
import { session } from '../../shared/session'
import { learningGuide } from '../../teach-ui/learningGuide'
import { resetPracticeCases } from '../../teach-ui/practice'
import { startVoice, stopVoice } from '../voice'
import type { Process } from './processes'
import { panel, usePanel } from './store'

/** Learning was stopped (or something else started) while Helpy waited. */
const learningStopped = (processId: string) => {
  const a = usePanel.getState().activity
  return a?.kind !== 'learning' || a.processId !== processId
}

/**
 * "Teach me this": Helpy leads at once ("First, we open ProcureFlow", pointing at its icon) while fresh practice
 * cases are prepared and the rules are compiled from Sabine's words; then it walks the trainee through every
 * step of the Work Map (learningGuide). The tutor agent joins for questions. Without voice, Helpy points and writes.
 */
export async function startLearning(p: Process) {
  if (!p.workMap) return
  panel.setActivity({ kind: 'learning', processId: p.id })
  panel.close()
  resetPracticeCases()
  learningGuide.begin(p.workMap)
  const { checkable } = await startTeach(p.workMap)
  if (learningStopped(p.id)) return
  // Without checkable rules Helpy could not stop a wrong decision: say so instead of teaching silently without it.
  if (checkable === 0 && p.workMap.guardrails.length > 0) {
    learningGuide.end()
    mascot.setState('idle')
    mascot.pointTo(null)
    mascot.bubble(`I couldn’t turn ${p.workMap.expert}’s rules into checks right now, so I could not stop a mistake. Let’s try again in a moment.`, {
      topic: 'step',
      actions: [
        { label: 'Try again', primary: true, onClick: () => void startLearning(p) },
        { label: 'Not now', onClick: () => void stopLearning() },
      ],
    })
    return
  }
  learningGuide.ready()
  void startVoice('teach')
}

export async function stopLearning() {
  learningGuide.end()
  await stopVoice()
  panel.setActivity(null)
  session().setMode('capture')
  erp().open(null)
  mascot.reset()
}
