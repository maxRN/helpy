// The spoken debrief as plain steps, without React or audio, so it can be tested end to end:
// questions until the debrief may end (at least three new ones) -> why it ends -> Work Map ->
// teach-back until the expert confirms (corrections rebuild the map) -> one stored record of all of it.
import type { GapsResult, LogLine } from '../server/debrief'
import type { DebriefQuestion, Quote, WorkMap } from '../shared/types'

export const MAX_DEBRIEF_ROUNDS = 6
export const MAX_TEACHBACK_ROUNDS = 3

export type DebriefPhase = 'finding' | 'asking' | 'concluding' | 'building' | 'teachback'

/** What the flow needs from the app: the server, the voice, and the screen. */
export interface DebriefIO {
  sessionId: string
  /** No guardrail question was asked during the task: the debrief starts with one. */
  needGuardrail?: boolean
  log(): Promise<LogLine[]>
  post<T>(url: string, body: unknown): Promise<T>
  /** Asks out loud; resolves with the answer, or null when it was skipped or not answered. */
  ask(question: string): Promise<string | null>
  /** Explains the process back; resolves with the expert's verdict, or null when interrupted. */
  teachBack(text: string): Promise<{ confirmed: boolean; correction?: string } | null>
  /** Says a line out loud (and shows it). */
  say(text: string): Promise<void>
  /** Waits until nobody talks or types. */
  waitForQuiet(question: string): Promise<void>
  stopped(): boolean
  /** False when a question names something that does not exist in the app (never asked). */
  grounded(question: string): boolean
  /** Removes made-up references from generated text. */
  scrub(text: string): string
  /** ms since the recording started. */
  now(): number
  phase(p: DebriefPhase): void
}

export type DebriefOutcome =
  | { kind: 'not_enough_work'; reason: string }
  | { kind: 'stopped' }
  | { kind: 'done'; workMap: WorkMap; confirmed: boolean }

/** "(no response)" / "(session ended)" from the voice layer are not corrections. */
const isCorrection = (c?: string): c is string => !!c && !c.startsWith('(')

export async function runDebriefFlow(io: DebriefIO): Promise<DebriefOutcome> {
  // 1. Questions, one at a time, each at a pause, until the server says the debrief may end.
  const questions: DebriefQuestion[] = []
  let live: GapsResult['live'] = []
  let doneReason = ''
  for (let round = 0; round < MAX_DEBRIEF_ROUNDS && !io.stopped(); round++) {
    io.phase('finding')
    const res = await io.post<GapsResult>('/api/debrief/gaps', {
      log: await io.log(),
      asked: questions.map((q) => ({ question: q.question, answered: q.status === 'answered' })),
      needGuardrail: io.needGuardrail ?? false,
    })
    // Too little of the task was recorded: say so instead of inventing questions or a Work Map.
    if (res.notEnoughWork) return { kind: 'not_enough_work', reason: res.doneReason }
    live = res.live ?? live
    doneReason = res.doneReason ?? ''
    if (res.done || res.gaps.length === 0) break
    for (const gap of res.gaps) {
      if (io.stopped()) return { kind: 'stopped' }
      if (!io.grounded(gap.question)) continue
      io.phase('asking')
      await io.waitForQuiet(gap.question)
      if (io.stopped()) return { kind: 'stopped' }
      const answer = await io.ask(gap.question)
      questions.push({ id: gap.id, question: gap.question, kind: gap.kind, t: gap.clip.start, status: answer ? 'answered' : 'skipped' })
    }
  }
  if (io.stopped()) return { kind: 'stopped' }

  // 2. Why the questions end, in Helpy's words from the server's decision. The Work Map is written
  //    meanwhile (one model call of several seconds), so the teach-back follows without a gap.
  const build = async (corrections: Quote[]) =>
    (await io.post<{ workMap: WorkMap }>('/api/workmap', { sessionId: io.sessionId, log: await io.log(), corrections: corrections.map((c) => c.text) })).workMap
  const corrections: Quote[] = []
  const firstMap = build(corrections)
  firstMap.catch(() => undefined) // awaited below; never an unhandled rejection while Helpy talks
  io.phase('concluding')
  if (doneReason) await io.say(doneReason)

  // 3. The Work Map, told back until the expert says it is right; each correction rebuilds it.
  io.phase('building')
  let workMap = await firstMap
  let text = ''
  let confirmed = false
  let rounds = 0
  for (; rounds < MAX_TEACHBACK_ROUNDS && !io.stopped(); ) {
    text = io.scrub((await io.post<{ text: string }>('/api/debrief/teachback', { workMap })).text)
    io.phase('teachback')
    await io.waitForQuiet('Here’s how I understood it.')
    rounds++
    const verdict = await io.teachBack(text)
    if (!verdict || io.stopped()) break
    if (verdict.confirmed) {
      confirmed = true
      break
    }
    if (!isCorrection(verdict.correction)) break
    corrections.push({ text: verdict.correction, t: io.now(), speaker: 'expert' })
    io.phase('building')
    workMap = await build(corrections)
  }
  if (io.stopped()) return { kind: 'stopped' }

  // 4. Saved either way, so nothing is lost; only a confirmed teach-back makes it "Ready to learn".
  const final: WorkMap = {
    ...workMap,
    teachback: { text, confirmed, corrections, rounds, ...(confirmed ? { confirmedAt: Date.now() } : {}) },
    debrief: { live, questions, doneReason, completedAt: Date.now() },
  }
  return { kind: 'done', workMap: final, confirmed }
}
