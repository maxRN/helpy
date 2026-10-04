import { useConvex, type ConvexReactClient } from 'convex/react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../../convex/_generated/api'
import { toLogLines } from '../debrief/sessionLog'
import { erpSync } from '../erp/sync'
import { mascot } from '../mascot'
import { activity } from '../shared/activity'
import { getEventLog } from '../shared/bus'
import { mascot as sharedMascot } from '../shared/mascot'
import { session, useSession } from '../shared/session'
import type { AppEvent, Gap, Quote, WorkMap } from '../shared/types'
import { panel } from './panel/store'
import { startVoice, stopVoice } from './voice'

// Helpy's follow-up questions after a recording, spoken only: no window, nothing to type.
// Same steps as P3's debrief (gaps -> answers -> Work Map -> teach-back -> confirmation), but before every
// question Helpy waits until nobody is talking or typing, then asks it out loud through the interviewer agent.

const MAX_QUESTIONS = 6
const MAX_TEACHBACK_ROUNDS = 3
/** Quiet means: no keyboard or mouse for this long, and nobody speaking for this long. */
const QUIET_INPUT_MS = 2500
const QUIET_SPEECH_MS = 1500

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
    mascot.bubble(asking ? 'Shall I skip this question?' : 'I’m still working on your questions.', {
      ttlMs: 10_000,
      actions: [
        ...(asking ? [{ label: 'Skip this question', primary: true, onClick: skip }] : []),
        { label: 'Stop for now', onClick: () => voiceDebrief.stop() },
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
    mascot.bubble('Okay, we’ll continue later. Click me and choose “Answer my questions”.', { ttlMs: 8000 })
  },
}

const agent = () => import('../agent/voice')
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
  const log = async () => {
    const stored = ((await convex.query(api.events.list, { sessionId }).catch(() => [])) ?? []) as AppEvent[]
    const byId = new Map<string, AppEvent>()
    for (const e of [...stored, ...getEventLog()]) byId.set(e.id, e)
    return toLogLines([...byId.values()].sort((a, b) => a.t - b.t))
  }
  const relNow = () => {
    const t0 = session().t0
    return t0 === null ? 0 : Date.now() - t0
  }

  panel.close()
  setPhase('finding')
  mascot.setState('thinking')
  mascot.bubble('Let me think about what I didn’t understand yet…')
  await startVoice('debrief')
  const voice = await agent()
  if (!voice.isConnected()) {
    setPhase('idle')
    mascot.setState('idle')
    mascot.bubble('I have a few questions, but I can’t talk right now. Click me later and choose “Answer my questions”.', { ttlMs: 10_000 })
    return
  }

  // 1. Questions, one at a time, each at a pause.
  let asked = 0
  while (asked < MAX_QUESTIONS && !run?.stopped) {
    setPhase('finding')
    const res = await post<{ gaps: Gap[]; done: boolean; doneReason?: string; notEnoughWork?: boolean }>('/api/debrief/gaps', { log: await log(), asked })
    // Too little of the task was recorded: say so instead of inventing questions or a Work Map.
    if (res.notEnoughWork) {
      setPhase('idle')
      mascot.setState('idle')
      mascot.bubble(res.doneReason ?? 'I saw too little work on screen. Record the task again.', { ttlMs: 12_000 })
      if (voice.isConnected()) void voice.say(res.doneReason ?? 'I saw too little work on screen. Please record the task again.').catch(() => undefined)
      return
    }
    if (res.done || res.gaps.length === 0) break
    for (const gap of res.gaps) {
      if (asked >= MAX_QUESTIONS || run?.stopped) break
      setPhase('asking')
      mascot.bubble(null)
      mascot.setState('listening')
      await waitForQuiet(gap.question)
      if (run?.stopped) return
      if (!takeSkip()) await interruptible(voice.ask(gap.question)) // no answer or skipped: go on
      takeSkip()
      asked += 1
    }
  }
  if (run?.stopped) return

  // 2. The Work Map, told back until the expert says it is right (or stops correcting).
  setPhase('building')
  mascot.setState('thinking')
  mascot.bubble('Thank you! I’m writing down how you work…')
  let workMap = (await post<{ workMap: WorkMap }>('/api/workmap', { sessionId, log: await log() })).workMap
  const corrections: Quote[] = []
  let text = ''
  let confirmed = false
  for (let round = 0; round < MAX_TEACHBACK_ROUNDS && !run?.stopped; round++) {
    text = (await post<{ text: string }>('/api/debrief/teachback', { workMap })).text
    setPhase('teachback')
    mascot.bubble('Here’s how I understood it. Tell me if something is wrong.')
    await waitForQuiet('Here’s how I understood it.')
    const verdict = await interruptible(voice.teachBack(text))
    if (!verdict || run?.stopped) break
    if (verdict.confirmed) {
      confirmed = true
      break
    }
    // "(no response)" / "(session ended)" are not corrections.
    if (!verdict.correction || verdict.correction.startsWith('(')) break
    corrections.push({ text: verdict.correction, t: relNow(), speaker: 'expert' })
    setPhase('building')
    mascot.setState('thinking')
    mascot.bubble('Thanks, I’m fixing that…')
    workMap = (await post<{ workMap: WorkMap }>('/api/workmap', { sessionId, log: await log() })).workMap
  }
  if (run?.stopped) return

  // 3. Saved either way, so nothing is lost; unconfirmed it stays "Has questions" for another round.
  const final: WorkMap = { ...workMap, teachback: { text, confirmed, corrections } }
  useSession.getState().setWorkMap(final)
  erpSync()?.saveWorkMap(final.sessionId, final)
  setPhase('idle')
  await stopVoice()
  if (confirmed) {
    mascot.setState('speaking')
    mascot.pose('cheer', 2200)
    mascot.bubble(`Got it, thank you! Now your team can learn “${final.task}” from you.`, { ttlMs: 8000 })
  } else {
    mascot.setState('idle')
    mascot.bubble('I wrote it down. Some parts still need your okay: click me later and choose “Answer my questions”.', { ttlMs: 10_000 })
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
        mascot.bubble('Something went wrong while I was thinking. Click me later and choose “Answer my questions”.', { ttlMs: 10_000 })
      })
      .finally(() => {
        sharedMascot.waiting(null)
        if (run === current) run = null
      })
  }, [runAt, convex])

  return null
}
