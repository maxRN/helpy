import { useConvex, type ConvexReactClient } from 'convex/react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../../convex/_generated/api'
import { needsGuardrailQuestion, toLogLines } from '../debrief/sessionLog'
import { erpSync } from '../erp/sync'
import { mascot } from '../mascot'
import { activity } from '../shared/activity'
import { getEventLog } from '../shared/bus'
import { scrubUngroundedInvoices, ungroundedInvoiceRefs } from '../shared/grounding'
import { mascot as sharedMascot } from '../shared/mascot'
import { session, sessionClock, useSession } from '../shared/session'
import type { AppEvent } from '../shared/types'
import { runDebriefFlow } from './debriefFlow'
import { panel } from './panel/store'
import { askAloud, debriefListening, sayAloud, startVoice, stopVoice, teachBackAloud } from './voice'

// Helpy's follow-up questions after a recording, spoken only: no window, nothing to type.
// Same steps as P3's debrief (gaps -> answers -> Work Map -> teach-back -> confirmation), but before every
// question Helpy waits until nobody is talking or typing, then asks it out loud through the interviewer agent.

/** Quiet means: no keyboard or mouse for this long, and nobody speaking for this long. */
const QUIET_INPUT_MS = 2500
const QUIET_SPEECH_MS = 1500
/** How long the debrief waits for the stored session events before it goes on with the ones in this page. */
const STORED_EVENTS_WAIT_MS = 4000

type Phase = 'idle' | 'finding' | 'asking' | 'building' | 'teachback'

export const useVoiceDebrief = create<{ phase: Phase; runAt: number }>()(() => ({ phase: 'idle', runAt: 0 }))

const setPhase = (phase: Phase) => useVoiceDebrief.setState({ phase })

/** The current run; skip and stop interrupt whatever Helpy waits for. */
let run: { stopped: boolean; skip: boolean; interrupt: (() => void) | null } | null = null

const skip = () => {
  if (!run) return
  run.skip = true
  run.interrupt?.()
}
/** True once per "Skip this question". */
const takeSkip = () => {
  const skipped = !!run?.skip
  if (run) run.skip = false
  return skipped
}

export const voiceDebrief = {
  start() {
    if (voiceDebrief.active()) return
    useVoiceDebrief.setState({ runAt: Date.now() })
  },
  active: () => useVoiceDebrief.getState().phase !== 'idle',
  /** Robot clicked during the debrief: skip the question or stop for now, as buttons in the bubble. */
  controls() {
    const asking = useVoiceDebrief.getState().phase === 'asking'
    mascot.bubble(asking ? say('Soll ich die Frage überspringen?', 'Shall I skip this question?') : say('Ich arbeite noch an meinen Fragen.', 'I’m still working on your questions.'), {
      actions: [
        ...(asking ? [{ label: say('Frage überspringen', 'Skip this question'), primary: true, onClick: skip }] : []),
        { label: say('Für jetzt aufhören', 'Stop for now'), onClick: () => voiceDebrief.stop() },
      ],
    })
  },
  stop() {
    if (!run) return
    run.stopped = true
    run.interrupt?.()
    sharedMascot.waiting(null)
    setPhase('idle')
    void stopVoice()
    mascot.setState('idle')
    mascot.bubble(say('Okay, wir machen später weiter. Klick mich an und wähle „Answer my questions“.', 'Okay, we’ll continue later. Click me and choose “Answer my questions”.'))
  },
}

const agent = () => import('../agent/voice')

/** Helpy's own lines in the language it spoke with the expert during the task. */
const say = (de: string, en: string) => (session().language === 'de' ? de : en)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${url} failed (${res.status})`)
  return data as T
}

/** Resolves when `p` settles or the run is skipped/stopped, whichever comes first. */
function interruptible<T>(p: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    if (!run || run.stopped) return resolve(null)
    run.interrupt = () => resolve(null)
    p.then(resolve, () => resolve(null))
  })
}

/** Waits until nobody talks or types; meanwhile Helpy raises its hand with the question ready. */
async function waitForQuiet(question: string) {
  const { lastExpertSpeechAt } = await agent()
  const busy = () => Date.now() - activity.lastTypingAt() < QUIET_INPUT_MS || Date.now() - lastExpertSpeechAt() < QUIET_SPEECH_MS
  if (!busy()) return
  sharedMascot.waiting(question)
  while (busy() && run && !run.stopped && !run.skip) await sleep(250)
  sharedMascot.waiting(null)
}

async function debrief(convex: ConvexReactClient) {
  const sessionId = session().sessionId
  // Answers just given may not be stored yet, and after a reload only Convex has the session: use both.
  const events = async () => {
    // Without a connection to Convex the query never settles: after a few seconds this page's own log has to do.
    const timeout = new Promise<AppEvent[]>((resolve) => setTimeout(() => resolve([]), STORED_EVENTS_WAIT_MS))
    const stored = ((await Promise.race([convex.query(api.events.list, { sessionId }).catch(() => []), timeout])) ?? []) as AppEvent[]
    const byId = new Map<string, AppEvent>()
    for (const e of [...stored, ...getEventLog()]) byId.set(e.id, e)
    return [...byId.values()].sort((a, b) => a.t - b.t)
  }
  const log = async () => toLogLines(await events())
  // The brief requires a guardrail question: if none came during the task, the debrief starts with one.
  const needGuardrail = needsGuardrailQuestion(await events())

  panel.close()
  setPhase('finding')
  mascot.setState('thinking')
  mascot.bubble(say('Ich überlege, was ich noch nicht verstanden habe…', 'Let me think about what I didn’t understand yet…'))
  await startVoice('debrief')
  // Same ears (Scribe, "Helpy hears") and voice (Helpy's TTS) as during the task.
  if (!debriefListening()) {
    setPhase('idle')
    mascot.setState('idle')
    mascot.bubble(say('Ich habe ein paar Fragen, kann aber gerade nicht sprechen. Klick mich später an und wähle „Answer my questions“.', 'I have a few questions, but I can’t talk right now. Click me later and choose “Answer my questions”.'))
    return
  }
  const stoppedOrSkipped = () => !run || run.stopped || run.skip

  const outcome = await runDebriefFlow({
    sessionId,
    needGuardrail,
    language: session().language,
    log,
    post,
    ask: async (question) => {
      mascot.bubble(null)
      mascot.setState('listening')
      if (takeSkip()) return null
      // Until it is really answered: "Wie meinst du das?" gets an explanation and the same question stays open.
      const outcome = await askAloud(question, { wrap: interruptible, stopped: stoppedOrSkipped })
      takeSkip()
      return outcome?.kind === 'answered' ? outcome.answer : null // no answer or skipped: go on
    },
    teachBack: (text) => teachBackAloud(text, { wrap: interruptible, stopped: () => !run || run.stopped }),
    say: async (text) => {
      await interruptible(sayAloud(text))
    },
    waitForQuiet,
    stopped: () => !!run?.stopped,
    grounded: (question) => {
      // Grounding: a question about an invoice that does not exist is never asked.
      if (!ungroundedInvoiceRefs(question).length) return true
      console.warn('[helpy] skipped a debrief question about an unknown invoice:', question)
      return false
    },
    scrub: scrubUngroundedInvoices,
    now: () => {
      const t0 = sessionClock()
      return t0 === null ? 0 : Date.now() - t0
    },
    phase: (p) => {
      if (p === 'asking') return setPhase('asking')
      if (p === 'teachback') return setPhase('teachback')
      setPhase(p === 'finding' ? 'finding' : 'building')
      mascot.setState('thinking')
      if (p === 'building') mascot.bubble(say('Danke! Ich schreibe auf, wie du arbeitest…', 'Thank you! I’m writing down how you work…'))
    },
  })

  if (outcome.kind === 'stopped') return
  if (outcome.kind === 'not_enough_work') {
    setPhase('idle')
    mascot.setState('idle')
    const reason = outcome.reason || say('Ich habe zu wenig Arbeit auf dem Bildschirm gesehen. Nimm die Aufgabe bitte noch einmal auf.', 'I saw too little work on screen. Please record the task again.')
    await sayAloud(reason).catch(() => undefined)
    await stopVoice()
    return
  }

  // Saved either way, so nothing is lost; unconfirmed it stays "Has questions" for another round.
  const final = outcome.workMap
  useSession.getState().setWorkMap(final)
  erpSync()?.saveWorkMap(final.sessionId, final)
  setPhase('idle')
  await stopVoice()
  if (outcome.confirmed) {
    mascot.setState('speaking')
    mascot.pose('cheer', 2200)
    mascot.bubble(say(`Verstanden, danke! Jetzt kann dein Team „${final.task}“ von dir lernen.`, `Got it, thank you! Now your team can learn “${final.task}” from you.`))
  } else {
    mascot.setState('idle')
    mascot.bubble(say('Ich habe es aufgeschrieben. Ein paar Teile brauchen noch dein Okay: klick mich später an und wähle „Answer my questions“.', 'I wrote it down. Some parts still need your okay: click me later and choose “Answer my questions”.'))
  }
}

/** Runs the spoken debrief when asked (voiceDebrief.start). Mounted once by Helpy, for the Convex client. */
export function VoiceDebrief() {
  const runAt = useVoiceDebrief((s) => s.runAt)
  const convex = useConvex()

  useEffect(() => {
    if (!runAt) return
    const current = { stopped: false, skip: false, interrupt: null as (() => void) | null }
    run = current
    debrief(convex)
      .catch((err: unknown) => {
        if (current.stopped) return
        console.warn('[helpy] debrief failed', err)
        setPhase('idle')
        void stopVoice()
        mascot.setState('idle')
        mascot.bubble('Something went wrong while I was thinking. Click me later and choose “Answer my questions”.')
      })
      .finally(() => {
        sharedMascot.waiting(null)
        if (run === current) run = null
      })
  }, [runAt, convex])

  return null
}
