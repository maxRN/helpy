// First visit: Helpy introduces itself to someone it has never seen (e.g. a judge) and shows them around, out loud.
// It comes to the middle of the screen and asks; "Show me around" sends it back to its corner, opens its app and
// walks through it page by page, then asks what they want to try first. Every line is spoken (TTS) and shown.
import { mascot, type BubbleAction } from '../mascot'
import { registry } from '../shared/registry'
import { useMascot } from '../shared/mascot'
import { useSession } from '../shared/session'
import { helpyApp } from './helpy-app/store'
import { EXAMPLE_ID } from './panel/processes'
import { panel, usePanel } from './panel/store'
import { recordFlow } from './RecordDialog'
import { TOUR_TARGETS } from './tourTargets'
import { prefetchSpeech, speak } from './voice'

const SEEN_KEY = 'helpy-tour-seen'

const LINES = {
  hello: "Hi! I don't think we've met. I'm Helpy, an apprentice that learns how your team works, and then teaches it to new colleagues. Want me to show you around?",
  company:
    'This is my app. Everything I learn ends up here. Company info is what I know about Hartmann: the team, the systems, and the rules everyone follows.',
  processes:
    "Recorded processes is everything I've watched. Each recording becomes a workflow: the steps, the rules, and the reasons behind them, in the expert's own words.",
  workflow:
    "Here's an example. Every step links to the moment I saw it, so a new hire can watch exactly what the expert did. And with Teach me this, I guide them through a real invoice and stop them before they break a rule.",
  privacy:
    "One more thing: privacy. Whenever something is private, just say \"off the record\". While I'm recording, you can also click me and choose Pause. I stop watching and listening right away, and no audio leaves your computer until you click Continue.",
  choose: "Now it's your turn. What would you like to try first?",
  openErp: "Let's record one. First, open ProcureFlow, the company's ERP. It's right here on the desktop.",
  record:
    "Now work through an invoice and talk me through it, like you would with a new colleague. I'll only ask when you pause. And if something is private, say \"off the record\". Ready?",
  learn: "Great choice. Click Teach me this, and I'll walk you through a real invoice, step by step, like a colleague would.",
  bye: "Have fun! I'll be down here in the corner. Click me whenever you need me.",
  later: "Sure! I'll be down here in the corner. Click me whenever you need me.",
}

let running = false
/** The tour's own bubble; any other bubble replacing it (e.g. a click on the robot) ends the tour. */
let current: string | null = null
let erpWatch: ReturnType<typeof setInterval> | null = null
/** True while the tour itself changes windows: opening Helpy's app clears the bubble, which is not someone else talking. */
let ownMove = false

function quietly(move: () => void) {
  ownMove = true
  try {
    move()
  } finally {
    ownMove = false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Storage can be blocked; then Helpy greets again on the next visit.
  }
}

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Shows the line with its buttons and says it; afterwards Helpy rests (not "listening": no microphone is on). */
async function say(text: string, actions: BubbleAction[], next?: string) {
  current = text
  mascot.bubble(text, { topic: 'prompt', actions })
  if (next) prefetchSpeech(next)
  await speak(text)
  if (useMascot.getState().state === 'listening' && useMascot.getState().bubble === text) mascot.setState('idle')
}

/** Ends the tour; `line` is said as a plain notice (it ends by itself when they work or click Helpy). */
function end(line?: string) {
  running = false
  current = null
  if (erpWatch) clearInterval(erpWatch)
  erpWatch = null
  markSeen()
  mascot.center(false)
  mascot.pointTo(null)
  if (line) {
    mascot.bubble(line)
    void speak(line).then(() => {
      if (useMascot.getState().state === 'listening') mascot.setState('idle')
    })
  }
}

const endTour: BubbleAction = { label: 'End tour', onClick: () => end(LINES.later) }
const next = (onClick: () => void): BubbleAction => ({ label: 'Next', primary: true, onClick })

function company() {
  mascot.center(false)
  quietly(() => helpyApp.open({ name: 'company' })) // first: opening the app clears Helpy's bubble
  mascot.pointTo(TOUR_TARGETS.company)
  void say(LINES.company, [next(processes), endTour], LINES.processes)
}

function processes() {
  helpyApp.go({ name: 'processes' })
  mascot.pointTo(TOUR_TARGETS.processes)
  void say(LINES.processes, [next(workflow), endTour], LINES.workflow)
}

function workflow() {
  helpyApp.go({ name: 'workflow', processId: EXAMPLE_ID })
  mascot.pointTo(TOUR_TARGETS.teach)
  void say(LINES.workflow, [next(privacy), endTour], LINES.privacy)
}

/** Off the record: by voice or a click; coming back is always a click (the microphone is off meanwhile). */
function privacy() {
  mascot.pointTo(null)
  void say(LINES.privacy, [next(choose), endTour], LINES.choose)
}

function choose() {
  mascot.pointTo(null)
  void say(LINES.choose, [
    { label: 'Record a task', primary: true, onClick: recordTask },
    { label: 'Learn a process', onClick: learn },
    { label: 'Look around myself', onClick: () => end(LINES.bye) },
  ], LINES.openErp)
}

/** ProcureFlow's window on the desktop, when it is open and not minimized. */
const erpOpen = () => !!document.querySelector('section[aria-label^="ProcureFlow"]:not([hidden])')

function recordTask() {
  helpyApp.close()
  if (erpOpen()) return readyToRecord()
  // The desktop icon belongs to the desktop; the tour only borrows it to point at it (the dock is outside Helpy's area).
  const icon = [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === 'ProcureFlow' && !b.closest('nav'))
  if (icon) registry.set(TOUR_TARGETS.erpIcon, icon)
  mascot.pointTo(icon ? TOUR_TARGETS.erpIcon : null)
  void say(LINES.openErp, [endTour], LINES.record)
  erpWatch = setInterval(() => {
    if (!erpOpen()) return
    if (erpWatch) clearInterval(erpWatch)
    erpWatch = null
    if (running) readyToRecord()
  }, 300)
}

function readyToRecord() {
  mascot.pointTo(null)
  void say(LINES.record, [
    {
      label: 'Start recording',
      primary: true,
      onClick: () => {
        end()
        recordFlow.open() // a click: the browser allows screen sharing right after one
      },
    },
    endTour,
  ])
}

function learn() {
  quietly(() => helpyApp.open({ name: 'workflow', processId: EXAMPLE_ID }))
  mascot.pointTo(TOUR_TARGETS.teach)
  // "Teach me this" closes the app and Helpy's guidance replaces this bubble, which ends the tour.
  void say(LINES.learn, [endTour])
}

function hello() {
  running = true
  markSeen() // once greeted, a reload does not greet again (?tour does)
  panel.close()
  mascot.center(true)
  mascot.pose('wave', 2600)
  // Without a click on the page yet, the browser may not play audio: then the bubble alone says it.
  void say(LINES.hello, [
    { label: 'Show me around', primary: true, onClick: company },
    { label: "I'll find my way", onClick: () => end(LINES.later) },
  ], LINES.company)
}

export const tour = {
  /** From Helpy's panel ("Show me around"): straight into its app, no hello. */
  start() {
    running = true
    panel.close()
    company()
  },
  active: () => running,
  /**
   * Call once on the client: greets a first-time visitor (or anyone with ?tour in the URL) after a moment.
   * Returns an uninstall function.
   */
  install(): () => void {
    const forced = new URLSearchParams(window.location.search).has('tour')
    prefetchSpeech(LINES.hello)
    const timer =
      forced || !seen()
        ? setTimeout(() => {
            const busy = usePanel.getState().activity !== null || recordFlow.active() || useSession.getState().mode === 'teach'
            if (!busy) hello()
          }, 1200)
        : undefined
    // Anything else Helpy says (a click on the robot, a recording, Teach) ends the tour.
    const off = useMascot.subscribe((s, prev) => {
      if (running && !ownMove && s.bubble !== prev.bubble && s.bubble !== current) end()
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  },
}
