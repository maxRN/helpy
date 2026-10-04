// Server only. Debrief: find what is still unclear, build the Work Map, write the teach-back.
import { z } from 'zod'
import { isDuplicateQuestion } from '../agent/coverage'
import { catalogForPrompt, TARGET_IDS } from '../erp/catalog'
import { clipAround } from '../workmap/moments'
import { conciseProcessName } from '../shared/processName'
import type { Gap, Guardrail, Quote, ScreenMoment, Step, WorkMap } from '../shared/types'
import { generateJson, MODELS } from './anthropic'

/** One line of the session as the models see it. `who` = screen | expert | agent. */
export const LogLineSchema = z.object({
  t: z.number(),
  who: z.enum(['screen', 'expert', 'agent']),
  text: z.string(),
})
export type LogLine = z.infer<typeof LogLineSchema>

export const MAX_DEBRIEF_QUESTIONS = 6
/** The brief's bar: at least three follow-up questions that were not answered during the task. */
export const MIN_DEBRIEF_QUESTIONS = 3

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const formatLog = (log: LogLine[]) =>
  [...log]
    .sort((a, b) => a.t - b.t)
    .map((l) => `[${mmss(l.t)} | t=${l.t}] ${l.who.toUpperCase()}: ${l.text}`)
    .join('\n')

export { clipAround }

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’.,!?;:()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A quote counts only if the expert actually said it (normalized substring of one of their lines). */
export function findExpertQuote(log: LogLine[], text: string): Quote | null {
  const needle = normalize(text)
  if (needle.length < 8) return null
  const line = log.find((l) => l.who === 'expert' && normalize(l.text).includes(needle))
  return line ? { text: text.trim(), t: line.t, speaker: 'expert' } : null
}

// ------------------------------------------------------------------ screen moments

/** A step is linked to a screen event inside its time range, or at most this far outside it. */
const STEP_MOMENT_SLACK_MS = 20_000
/** A rule explained live is linked to the last screen change at most this long before the expert said it. */
const RULE_LOOKBACK_MS = 90_000

const isDecisionLine = (l: LogLine) => /→|put on hold|second approval/.test(l.text)
const asMoment = (l: LogLine | undefined): ScreenMoment | null => (l ? { t: l.t, event: l.text } : null)

/** The real screen event behind a step: inside [start, end] (a decision first), else the nearest within the slack. */
export function stepMoment(log: LogLine[], start: number, end: number): ScreenMoment | null {
  const screen = log.filter((l) => l.who === 'screen')
  const inside = screen.filter((l) => l.t >= start && l.t <= end)
  if (inside.length) return asMoment(inside.find(isDecisionLine) ?? inside[0])
  const dist = (l: LogLine) => (l.t < start ? start - l.t : l.t - end)
  const near = screen.filter((l) => dist(l) <= STEP_MOMENT_SLACK_MS).sort((a, b) => dist(a) - dist(b))
  return asMoment(near[0])
}

/** The screen change the expert was explaining: the last one before `t` (a decision first), within the lookback. */
export function momentBefore(log: LogLine[], t: number): ScreenMoment | null {
  const before = log.filter((l) => l.who === 'screen' && l.t <= t && t - l.t <= RULE_LOOKBACK_MS)
  return asMoment([...before].reverse().find(isDecisionLine) ?? before[before.length - 1])
}

/** How the expert came to say `quote`: a live question, the debrief, a teach-back correction, or unprompted. */
export function quoteVia(log: LogLine[], quote: Quote, corrections: readonly string[] = []): NonNullable<Quote['via']> {
  const said = normalize(quote.text)
  if (corrections.some((c) => normalize(c).includes(said) || said.includes(normalize(c)))) return 'teachback'
  const captureEnd = Math.max(0, ...log.filter((l) => l.who === 'screen').map((l) => l.t))
  const sorted = [...log].sort((a, b) => a.t - b.t)
  const prev = sorted.filter((l) => l.t < quote.t && l.who !== 'screen').pop()
  if (prev?.who === 'agent' && prev.text.trim().endsWith('?')) return quote.t > captureEnd ? 'debrief' : 'live_question'
  return quote.t > captureEnd ? 'debrief' : 'narration'
}

// ------------------------------------------------------------------ gaps

const GapsSchema = z.object({
  gaps: z.array(
    z.object({
      question: z.string(),
      kind: z.enum(['why', 'guardrail', 'exception', 'unseen_case']),
      aboutT: z.number(),
    }),
  ),
  done: z.boolean(),
  doneReason: z.string(),
})

const GAPS_SYSTEM = `You run the debrief after an accounts-payable expert finished a task while an apprentice watched.
You get the session log: what changed on screen, what the expert said, the questions already asked live and their answers.

Only the work counts. Ignore everything that is not about doing the task: chatter with colleagues, testing or discussing the recording tool, remarks to the apprentice, jokes, swearing. Never ask about those.

The live questions already covered single decisions as they happened. The debrief is for what is still missing to do the task alone, in this order:
1. The rule behind a decision that is still unexplained, asked as a rule check ("Is that always the case, or only for …?").
2. Exceptions: when the usual rule does not apply.
3. Cases that did not come up but obviously could.
4. Who decides or must be asked, and when to stop.
Turn them into short spoken questions (max 18 words each):
- "why": a decision on screen without a stated reason.
- "guardrail": a limit, a threshold, or when to stop and ask someone, that is implied but not stated.
- "exception": when the usual rule does not apply.
- "unseen_case": a case that did not come up but obviously could (e.g. a supplier not in the vendor master, an amount just under a limit).
Style: spoken aloud by a curious apprentice while the screen moment replays. Refer to that moment, use words not codes, e.g.
"You held the Kramer invoice at the quarter-end. Is that for every supplier, and who decides when to release it?"
Rules:
- Never ask what the log already answers. Never repeat an earlier question.
- aboutT: the t (ms) of the screen moment the question is about, copied from the log; for unseen cases use the closest related moment.
- Order by importance. At most 3 questions per round.
- "Required new questions" in the request: while it is above 0 you MUST return at least that many new questions and done = false.
  Good debrief questions then are rule checks, exceptions, unseen cases and who decides; never a question the live questions already covered.
- done = true when every decision has a reason and every judgment call has its guardrail (or the expert said there is none).
- doneReason: one or two short spoken sentences in first person, why you now understand the process (what is covered) or what is still open, e.g.
  "I think I've got it: every decision has a reason now, and you told me when to stop and ask Weber." Never mention ids or codes.`

export class NotEnoughWorkError extends Error {
  constructor() {
    super('I saw too little work on screen to write a Work Map. Record the task again and work through a few invoices.')
  }
}

/** At least this many screen changes are needed before there is a process to ask about or write down. */
export const MIN_SCREEN_LINES = 3

export const hasEnoughWork = (log: LogLine[]) => log.filter((l) => l.who === 'screen').length >= MIN_SCREEN_LINES

export const NOT_ENOUGH_WORK =
  'I saw too little work on screen to ask good questions. Record the task again and work through a few invoices while you explain.'

/** A debrief question already asked in this debrief, and whether the expert answered it. */
export const AskedGapSchema = z.object({ question: z.string(), answered: z.boolean() })
export type AskedGap = z.infer<typeof AskedGapSchema>

/** A question asked live during the task (agent line) and whether the expert answered before the next agent line. */
export interface LiveQuestion {
  question: string
  t: number
  answered: boolean
}

/** The live questions of the task: agent questions in the log that were not asked in this debrief. */
export function liveQuestions(log: LogLine[], debrief: readonly AskedGap[] = []): LiveQuestion[] {
  const sorted = [...log].sort((a, b) => a.t - b.t)
  const out: LiveQuestion[] = []
  sorted.forEach((l, i) => {
    if (l.who !== 'agent' || !l.text.trim().endsWith('?')) return
    if (debrief.some((d) => d.question.trim() === l.text.trim())) return
    const next = sorted.slice(i + 1).find((x) => x.who !== 'screen')
    out.push({ question: l.text.trim(), t: l.t, answered: next?.who === 'expert' })
  })
  return out
}

export interface GapsResult {
  gaps: Gap[]
  done: boolean
  doneReason: string
  notEnoughWork?: boolean
  /** How many more debrief questions are required before the debrief may end. */
  required: number
  /** The live questions the debrief must not repeat. */
  live: LiveQuestion[]
}

const DECISION = /→|put on hold|second approval/

/**
 * Last resort when the model gives too few usable questions while some are still required: short spoken
 * questions about exceptions, stop-and-ask moments and unseen cases, each tied to a real screen moment
 * of the log. They ask; they never state a fact about the process.
 */
export function fallbackGaps(log: LogLine[], count: number, avoid: readonly { question: string }[], idStart: number): Gap[] {
  const screen = log.filter((l) => l.who === 'screen')
  const decisions = screen.filter((l) => DECISION.test(l.text))
  const at = (decisions[decisions.length - 1] ?? screen[screen.length - 1])?.t ?? 0
  const first = (decisions[0] ?? screen[0])?.t ?? at
  const candidates: { question: string; kind: Gap['kind']; t: number }[] = [
    { question: 'Looking at that moment again: when would you not do it the way you just did?', kind: 'exception', t: at },
    { question: 'When do you stop on an invoice like this and ask someone, and who is that?', kind: 'guardrail', t: first },
    { question: 'What do you do with an invoice from a supplier you have never seen before?', kind: 'unseen_case', t: first },
    { question: 'What if the amount were just under one of your limits? Would you still do the same?', kind: 'unseen_case', t: at },
    { question: 'Is there anything you would never do with an invoice like this one?', kind: 'guardrail', t: at },
  ]
  const out: Gap[] = []
  for (const c of candidates) {
    if (out.length >= count) break
    if (isDuplicateQuestion(c.question, [...avoid, ...out])) continue
    out.push({ id: `gap-${idStart + out.length + 1}`, question: c.question, kind: c.kind, clip: clipAround(c.t) })
  }
  return out
}

const describeAsked = (live: LiveQuestion[], debrief: readonly AskedGap[]) =>
  [
    'Live questions already asked during the task (do not repeat them):',
    ...(live.length ? live.map((q) => `- ${q.question} (${q.answered ? 'answered' : 'not answered'})`) : ['- none']),
    'Debrief questions already asked (do not repeat them):',
    ...(debrief.length ? debrief.map((q) => `- ${q.question} (${q.answered ? 'answered' : 'skipped'})`) : ['- none']),
  ].join('\n')

/**
 * The next debrief questions. At least MIN_DEBRIEF_QUESTIONS new ones are asked before the debrief may end;
 * none repeats a live question or an earlier debrief question. `asked` is the list of debrief questions so
 * far (a number is accepted from older clients and only counts).
 */
export async function findGaps(log: LogLine[], asked: readonly AskedGap[] | number): Promise<GapsResult> {
  const debrief: AskedGap[] = typeof asked === 'number' ? Array.from({ length: asked }, () => ({ question: '', answered: true })) : [...asked]
  const live = liveQuestions(log, debrief)
  const askedSoFar = debrief.length
  const required = Math.max(0, MIN_DEBRIEF_QUESTIONS - askedSoFar)
  if (!hasEnoughWork(log)) return { gaps: [], done: true, doneReason: NOT_ENOUGH_WORK, notEnoughWork: true, required: 0, live }
  if (askedSoFar >= MAX_DEBRIEF_QUESTIONS) {
    return { gaps: [], done: true, doneReason: `I asked all ${MAX_DEBRIEF_QUESTIONS} questions I had; anything still open is noted in the Work Map.`, required: 0, live }
  }
  const room = Math.min(3, MAX_DEBRIEF_QUESTIONS - askedSoFar)
  const avoid = [...live, ...debrief.filter((d) => d.question)]

  const usable = (raw: { question: string; kind: Gap['kind']; aboutT: number }[], have: Gap[]) => {
    const out: Gap[] = []
    for (const g of raw) {
      const question = g.question.trim()
      if (!question || isDuplicateQuestion(question, [...avoid, ...have, ...out])) continue
      out.push({ id: `gap-${askedSoFar + have.length + out.length + 1}`, question, kind: g.kind, clip: clipAround(g.aboutT) })
    }
    return out
  }

  let gaps: Gap[] = []
  let modelDone = false
  let doneReason = ''
  try {
    const out = await generateJson({
      model: MODELS.deep,
      schema: GapsSchema,
      system: GAPS_SYSTEM,
      content: `Session log:\n${formatLog(log)}\n\n${describeAsked(live, debrief)}\n\nRequired new questions: ${required}. Questions left in the budget: ${MAX_DEBRIEF_QUESTIONS - askedSoFar}.`,
      effort: 'medium',
    })
    gaps = usable(out.gaps, []).slice(0, room)
    modelDone = out.done
    doneReason = out.doneReason.trim()
    // Too few new questions while some are still required: ask the model once more, naming what it repeated.
    if (gaps.length < Math.min(required, room)) {
      const more = await generateJson({
        model: MODELS.deep,
        schema: GapsSchema,
        system: GAPS_SYSTEM,
        content: `Session log:\n${formatLog(log)}\n\n${describeAsked(live, debrief)}\nAlready chosen this round: ${gaps.map((g) => g.question).join(' | ') || 'none'}\n\nRequired new questions: ${required - gaps.length}. Every question must be new: about an exception, a rule you are unsure about, a case that did not come up, or who decides. Ground each in a moment of the log.`,
        effort: 'low',
      })
      gaps = [...gaps, ...usable(more.gaps, gaps)].slice(0, room)
    }
  } catch (err) {
    console.warn('[debrief/gaps] model failed', err)
  }
  // Still short of the required questions (model down or repeating itself): grounded fallback questions.
  if (gaps.length < Math.min(required, room)) gaps = [...gaps, ...fallbackGaps(log, Math.min(required, room) - gaps.length, [...avoid, ...gaps], askedSoFar + gaps.length)]

  const done = required === 0 && (modelDone || gaps.length === 0)
  if (done && !doneReason) doneReason = 'I think I understand it now: the decisions I saw have their reasons, and I know when to stop and ask.'
  return { gaps: done ? [] : gaps, done, doneReason, required, live }
}

// ------------------------------------------------------------------ Work Map

const WorkMapDraftSchema = z.object({
  task: z.string(),
  steps: z.array(
    z.object({
      title: z.string(),
      targetId: z.string(),
      startT: z.number(),
      endT: z.number(),
      decision: z.string(),
      reasonQuote: z.string(),
      isJudgmentCall: z.boolean(),
      confidence: z.number(),
      guardrailIds: z.array(z.string()),
    }),
  ),
  guardrails: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      quote: z.string(),
    }),
  ),
  openQuestions: z.array(z.string()),
})

const WORKMAP_SYSTEM = `You turn an apprentice's session log into a Work Map: the steps a new hire follows, in order, with the expert's reasons and guardrails.
Only the work counts: ignore chatter with colleagues, talk about the recording tool and remarks to the apprentice.

- task: a short process name for a list, 3 to 5 words, at most 48 characters, Title Case, verb first when natural.
  No sentence, no explanation, no "Process for …" or "How to …". Examples: "Approve Supplier Invoice", "Handle Quarter-End Duplicates", "Code Equipment Invoice".
- steps: the generic procedure for one invoice, in order (not one entry per invoice). Include the judgment calls as their own steps.
  targetId: the screen element of the step, one of the listed ids, or "" if none fits.
  startT / endT: t values (ms) from the log of the clearest moment where the expert did this step (10–20 s apart).
  decision: what the expert did there, concretely (e.g. "Re-coded 4711 → 0400 (capex)").
  reasonQuote: the expert's reason COPIED VERBATIM from an EXPERT line of the log (a phrase or sentence), or "" if they gave none.
  confidence: 0–1, how sure the log makes you.
- guardrails: rules with a limit, an exception or a stop-and-ask moment. id G1, G2, … text: the rule in one plain sentence.
  quote: the expert's words COPIED VERBATIM from an EXPERT line. Link guardrails from steps via guardrailIds.
- openQuestions: what is still unclear.
- Never invent a rule or a quote the expert did not say.

${catalogForPrompt()}`

/**
 * `corrections`: what the expert said was wrong in the teach-back, in their words. They override anything
 * else in the log, and each is also an expert line of the log, so it can be quoted.
 */
export async function buildWorkMap(sessionId: string, log: LogLine[], expert = 'Sabine', corrections: string[] = []): Promise<{ workMap: WorkMap; warnings: string[] }> {
  if (!hasEnoughWork(log)) throw new NotEnoughWorkError()
  const fixes = corrections.length
    ? `\n\nThe expert corrected your last teach-back. These corrections override anything else in the log; change the steps and guardrails so they say this, quoting the expert's correction:\n${corrections.map((c) => `- "${c}"`).join('\n')}`
    : ''
  const draft = await generateJson({
    model: MODELS.deep,
    schema: WorkMapDraftSchema,
    system: WORKMAP_SYSTEM,
    content: `Session log:\n${formatLog(log)}${fixes}`,
    effort: 'medium',
  })
  const warnings: string[] = []
  const lastT = Math.max(0, ...log.map((l) => l.t))

  const guardrails: Guardrail[] = []
  for (const g of draft.guardrails) {
    const quote = findExpertQuote(log, g.quote)
    if (!quote) {
      warnings.push(`Dropped guardrail "${g.text}": quote not found in what the expert said.`)
      continue
    }
    guardrails.push({ id: g.id, text: g.text.trim(), quote: { ...quote, via: quoteVia(log, quote, corrections) }, when: [], require: [], severity: 'block' })
  }
  const known = new Set(guardrails.map((g) => g.id))

  const steps: Step[] = draft.steps.map((s, i) => {
    const id = `S${i + 1}`
    const reason = s.reasonQuote ? findExpertQuote(log, s.reasonQuote) : null
    if (s.reasonQuote && !reason) warnings.push(`Step "${s.title}": reason quote not found, left out.`)
    const start = Math.max(0, Math.min(s.startT, lastT))
    const end = Math.max(start + 10_000, Math.min(s.endT, start + 20_000))
    // The clip is centered on a real screen event; without one the step says so instead of a made-up time.
    const moment = stepMoment(log, start, end)
    return {
      id,
      index: i + 1,
      title: s.title.trim(),
      ...(TARGET_IDS.includes(s.targetId) ? { targetId: s.targetId } : {}),
      clip: moment ? clipAround(moment.t) : { start, end },
      moment,
      decision: s.decision.trim(),
      ...(reason ? { reason: { ...reason, via: quoteVia(log, reason, corrections) } } : {}),
      guardrailIds: s.guardrailIds.filter((g) => known.has(g)),
      isJudgmentCall: s.isJudgmentCall,
      confidence: Math.max(0, Math.min(1, reason || !s.reasonQuote ? s.confidence : s.confidence * 0.6)),
    }
  })
  // Each guardrail points back at the first step that uses it, and at the screen moment it was explained at:
  // said during the task = the screen change just before; said afterwards = its step's moment, if any.
  for (const g of guardrails) {
    const step = steps.find((s) => s.guardrailIds.includes(g.id))
    g.stepId = step?.id
    const live = g.quote.via === 'live_question' || g.quote.via === 'narration'
    g.moment = (live ? momentBefore(log, g.quote.t) : null) ?? step?.moment ?? null
  }

  return {
    // A verbose model output never becomes a huge title in "Recorded processes".
    workMap: { sessionId, task: conciseProcessName(draft.task) || 'Recorded Process', expert, language: 'en', steps, guardrails, openQuestions: draft.openQuestions },
    warnings,
  }
}

// ------------------------------------------------------------------ teach-back

const TeachbackSchema = z.object({ text: z.string() })

export async function writeTeachback(workMap: WorkMap): Promise<string> {
  const out = await generateJson({
    model: MODELS.deep,
    schema: TeachbackSchema,
    system: `You are the apprentice. Explain the expert's process back to them in your own words, in under 60 seconds of speech (max 140 words).
Spoken style, second person ("you"), plain sentences, no lists or markdown. Cover every step in order, each judgment call with its reason, and every guardrail.
Do not ask a question at the end; the agent asks "Is that how it works?" itself.`,
    content: JSON.stringify({ task: workMap.task, expert: workMap.expert, steps: workMap.steps, guardrails: workMap.guardrails }),
    effort: 'low',
  })
  return out.text.trim()
}
