// The running Teach guide: Helpy leads from the moment learning starts ("First, we open ProcureFlow"), says
// every Work Map step in order and moves on only after the trainee did it. See guide.ts for what it says.
import { sayStep, type SayStepOptions } from '../app/voice'
import { getNextStep } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { PREVIEW_TARGET } from '../erp/targetIds'
import { registry } from '../shared/registry'
import { session } from '../shared/session'
import type { WorkMap } from '../shared/types'
import { createGuide, type Cue, type GuideState } from './guide'

let active: { wm: WorkMap; ready: boolean } | null = null
let line = 0 // the newest line; an older one that is not said yet is dropped
let appPoll: ReturnType<typeof setInterval> | undefined
let soon: ReturnType<typeof setTimeout> | undefined
// Invoices the trainee finished (post, hold, 2nd approval): known at the click, before the ERP saved the new status.
const finished = new Set<string>()

/** ProcureFlow's window is open on screen: its inbox or an invoice is visible (a minimized window has no boxes). */
function appOpen(): boolean {
  return registry.ids().some((id) => (id.startsWith('row-') || id === PREVIEW_TARGET) && (registry.get(id)?.getClientRects().length ?? 0) > 0)
}

/** Still typing into a field: the step is not done before the field is left. */
function typing(): boolean {
  const a = typeof document === 'undefined' ? null : document.activeElement
  return a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !['button', 'submit', 'checkbox', 'radio', 'range'].includes(a.type))
}

function state(): GuideState | null {
  if (!active) return null
  const wm = (active.ready && session().workMap) || active.wm
  const { openId, invoices } = erp()
  const open = openId ? (invoices[openId] ?? null) : null
  const nextCase = Object.values(invoices).find((i) => i.teachOnly && i.status === 'open' && !finished.has(i.id)) ?? null
  const stepsOf = open?.teachOnly ? open : open ? null : nextCase
  return {
    wm,
    appOpen: appOpen(),
    ready: active.ready,
    nextCase,
    open,
    finished: !!open && (finished.has(open.id) || open.status !== 'open'),
    nextStep: active.ready && stepsOf ? getNextStep(stepsOf.id) : null,
  }
}

function say(cue: Cue, opts: { tone?: 'alert'; actions?: SayStepOptions['actions']; context?: string } = {}) {
  const mine = ++line
  void sayStep(cue.text, { target: cue.target, current: () => mine === line && !!active, ...opts })
}

const guide = createGuide({ state, say: (cue) => say(cue) })

export const learningGuide = {
  /** Learning starts: Helpy speaks at once (the practice rules are compiled meanwhile, see ready()). */
  begin(wm: WorkMap) {
    learningGuide.end()
    active = { wm, ready: false }
    guide.update()
    // Opening the app is not an event in ProcureFlow: watch for its window.
    appPoll = setInterval(() => {
      if (state()?.appOpen && guide.current() === 'open-app') learningGuide.update(0)
    }, 300)
  },
  /** The practice case is ready (rules compiled, Teach mode on): the next step follows. */
  ready() {
    if (!active) return
    active.ready = true
    learningGuide.update(0)
  },
  /** After anything the trainee did: says the next step if the current one is done. Never while they type. */
  update(delay = 600) {
    clearTimeout(soon)
    soon = setTimeout(() => {
      if (!active || typing()) return
      guide.update()
    }, delay)
  },
  /** A line outside the steps (reminder, praise, done, the guardrail stop), spoken the same way. */
  say(text: string, target: string | null, opts: { tone?: 'alert'; actions?: SayStepOptions['actions']; context?: string } = {}) {
    if (!active) return
    clearTimeout(soon)
    say({ key: 'aside', text, target }, opts)
  },
  /** Say the current step again after an aside (e.g. once a broken rule is fixed). */
  repeatStep(delay = 600) {
    guide.reset()
    learningGuide.update(delay)
  },
  finished(invoiceId: string) {
    finished.add(invoiceId)
  },
  reopened(invoiceId: string) {
    finished.delete(invoiceId)
  },
  isActive: () => !!active,
  end() {
    active = null
    line++
    clearInterval(appPoll)
    clearTimeout(soon)
    finished.clear()
    guide.reset()
  },
}
