// Teach: Helpy leads the new hire through a practice case, one step of the expert's Work Map at a time.
// It says each step out loud and shows the same words in its bubble while it flies to the step's target, and it
// only moves on once the step was really done (the step tracker saw it). The tutor agent answers questions.
import type { Invoice } from '../erp/model'
import { actionTarget, DESKTOP_APP_TARGET, PREVIEW_TARGET, rowTarget } from '../erp/targetIds'
import type { Step, WorkMap } from '../shared/types'

/** What Helpy says now: `key` identifies the cue, so every cue is said once. */
export interface Cue {
  key: string
  text: string
  /** What Helpy flies to while it says it (null: stays in its corner). */
  target: string | null
}

/** What the guide looks at (all from the app's real state). */
export interface GuideState {
  wm: WorkMap
  /** ProcureFlow's window is open on screen. */
  appOpen: boolean
  /** The practice rules are compiled and the cases are ready to open. */
  ready: boolean
  /** The practice case to open next (null: all done). */
  nextCase: Invoice | null
  /** The invoice open in ProcureFlow, if any. */
  open: Invoice | null
  /** The open invoice was finished (posted, held, sent for approval). */
  finished: boolean
  /** The first Work Map step the trainee has not done yet on the open (or next) invoice. */
  nextStep: Step | null
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const sentence = (s: string) => s.trim().replace(/[.!?]*$/, '.')

/** The line for one Work Map step: plain steps are said, judgment calls are asked. */
export function stepLine(wm: WorkMap, step: Step): string {
  return step.isJudgmentCall ? `${sentence(step.title)} Your call: what would ${wm.expert} do here?` : `Next: ${lower(sentence(step.title))}`
}

/** The one thing to do now, or null when Helpy should stay quiet (waiting, or the case is done). */
export function cueFor(s: GuideState): Cue | null {
  const { wm } = s
  if (!s.appOpen) return { key: 'open-app', text: 'First, we open ProcureFlow. Click its icon on your desktop.', target: DESKTOP_APP_TARGET }
  // The case is still being prepared: Helpy says what comes, then the first real step when it is ready.
  if (!s.ready) return { key: 'intro', text: `Let's practise a case ${wm.expert} never showed you. I'll walk you through it, step by step.`, target: null }
  if (!s.open) {
    if (!s.nextCase) return { key: 'all-done', text: `That was every practice case. Nice work!`, target: null }
    const c = s.nextCase
    // Looking at the invoice is the first step in most Work Maps: it is done by opening it, so it is said here.
    const first = s.nextStep?.targetId === PREVIEW_TARGET ? ` ${wm.expert}'s first step: ${lower(sentence(s.nextStep.title))}` : ''
    return { key: `open:${c.id}`, text: `Now open invoice ${c.number} from ${c.supplierName}.${first}`, target: rowTarget(c.id) }
  }
  if (!s.open.teachOnly) {
    const c = s.nextCase
    return { key: `other:${s.open.id}`, text: c ? `That one is ${wm.expert}'s own invoice. Go back and open invoice ${c.number}.` : `That one is ${wm.expert}'s own invoice.`, target: null }
  }
  if (s.finished) return null // TeachLayer says it is done and shows the report
  if (!s.nextStep?.targetId) {
    return { key: `decide:${s.open.id}`, text: `That's everything ${wm.expert} checks. Now decide: post it, hold it, or ask for a second approval?`, target: actionTarget('post') }
  }
  return { key: `step:${s.open.id}:${s.nextStep.id}`, text: stepLine(wm, s.nextStep), target: s.nextStep.targetId }
}

export interface GuideOpts {
  state(): GuideState | null
  /** Says the line, and at the moment the voice starts shows it in the bubble and flies to `target`. */
  say(cue: Cue): void
}

/** Says each cue once, in order; `update()` after anything the trainee did. */
export function createGuide(o: GuideOpts) {
  let said: string | null = null
  return {
    /** Says the current cue if it is new. Returns it (or null when there is nothing new to say). */
    update(): Cue | null {
      const s = o.state()
      const cue = s ? cueFor(s) : null
      if (!cue || cue.key === said) return null
      said = cue.key
      o.say(cue)
      return cue
    },
    /** Says something outside the steps (a reminder, praise); the current step is said again after it if asked. */
    say(cue: Cue, opts: { repeatStepAfter?: boolean } = {}) {
      if (opts.repeatStepAfter) said = null
      o.say(cue)
    },
    /** The cue said last (its key). */
    current: () => said,
    reset() {
      said = null
    },
  }
}

export type Guide = ReturnType<typeof createGuide>
