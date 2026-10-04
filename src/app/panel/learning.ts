import { erp } from '../../erp/store'
import { startTeach } from '../../erp/teach'
import { rowTarget } from '../../erp/targetIds'
import { mascot } from '../../mascot'
import { registry } from '../../shared/registry'
import { session } from '../../shared/session'
import { resetPracticeCases } from '../../teach-ui/practice'
import { startVoice, stopVoice } from '../voice'
import type { Process } from './processes'
import { panel, usePanel } from './store'

/** Learning was stopped (or something else started) while Helpy waited. */
const learningStopped = (processId: string) => {
  const a = usePanel.getState().activity
  return a?.kind !== 'learning' || a.processId !== processId
}

const DESKTOP_ICON = 'desktop-procureflow'
const OPEN_ERP_WAIT_MS = 120_000

/** ProcureFlow's icon on the mock desktop (only shown while its window is closed). */
const desktopIcon = () =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === 'ProcureFlow' && !b.closest('section')) ?? null

async function waitFor(ok: () => boolean, ms: number) {
  const until = Date.now() + ms
  while (!ok() && Date.now() < until) await new Promise((r) => setTimeout(r, 300))
  return ok()
}

/**
 * "Teach me this": fresh practice cases in the ERP, the rules compiled from Sabine's words,
 * then the tutor talks and points. Without voice, Helpy points and writes in its bubble.
 */
export async function startLearning(p: Process) {
  if (!p.workMap) return
  panel.setActivity({ kind: 'learning', processId: p.id })
  panel.close()
  mascot.setState('thinking')
  mascot.bubble('One moment, I’m getting a case ready for you…', { topic: 'step' })
  resetPracticeCases()
  await startTeach(p.workMap)
  const first = Object.values(erp().invoices).find((i) => i.teachOnly && i.status === 'open')
  const row = first ? rowTarget(first.id) : null
  // The ERP window is closed: first point at its icon on the desktop, then carry on once it is open.
  if (row && !registry.get(row)) {
    const icon = desktopIcon()
    if (icon) registry.set(DESKTOP_ICON, icon)
    mascot.setState('speaking')
    mascot.pointTo(icon ? DESKTOP_ICON : null)
    mascot.bubble('First open ProcureFlow: click it on your desktop.', { topic: 'step' })
    await waitFor(() => !!registry.get(row), OPEN_ERP_WAIT_MS)
    if (icon) registry.delete(DESKTOP_ICON, icon)
    if (learningStopped(p.id)) return
  }
  mascot.setState('speaking')
  if (row) mascot.pointTo(row)
  mascot.bubble(
    first
      ? `Let’s do a case ${p.workMap.expert} never showed you. Open invoice ${first.number}, I’ll tell you what to do.`
      : `I learned this from ${p.workMap.expert}. Click me whenever you need help.`,
    { topic: 'step' },
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
