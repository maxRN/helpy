// Server only. Debrief: find what is still unclear, build the Work Map, write the teach-back.
import { z } from 'zod'
import { catalogForPrompt, TARGET_IDS } from '../erp/catalog'
import { conciseProcessName } from '../shared/processName'
import type { Gap, Guardrail, Quote, Step, WorkMap } from '../shared/types'
import { generateJson, MODELS } from './anthropic'

/** One line of the session as the models see it. `who` = screen | expert | agent. */
export const LogLineSchema = z.object({
  t: z.number(),
  who: z.enum(['screen', 'expert', 'agent']),
  text: z.string(),
})
export type LogLine = z.infer<typeof LogLineSchema>

export const MAX_DEBRIEF_QUESTIONS = 6
const CLIP_BEFORE_MS = 8000
const CLIP_AFTER_MS = 8000

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const formatLog = (log: LogLine[]) =>
  [...log]
    .sort((a, b) => a.t - b.t)
    .map((l) => `[${mmss(l.t)} | t=${l.t}] ${l.who.toUpperCase()}: ${l.text}`)
    .join('\n')

export const clipAround = (t: number) => ({ start: Math.max(0, t - CLIP_BEFORE_MS), end: t + CLIP_AFTER_MS })

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
- done = true when every decision has a reason and every judgment call has its guardrail (or the expert said there is none). Say why in doneReason.`

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

/** The brief: "The debrief asks at least three follow-up questions that were not answered during the task." */
export const MIN_DEBRIEF_QUESTIONS = 3

export const FALLBACK_GUARDRAIL_GAP = 'Is there a limit, or a case where you would stop and ask someone before doing this?'

/**
 * needGuardrail: no guardrail question was asked during the task (the brief requires one), so the
 * debrief's first question must be one. If the model does not deliver it, a fixed one is put first.
 */
export async function findGaps(
  log: LogLine[],
  askedSoFar: number,
  needGuardrail = false,
): Promise<{ gaps: Gap[]; done: boolean; doneReason: string; notEnoughWork?: boolean }> {
  if (!hasEnoughWork(log)) return { gaps: [], done: true, doneReason: NOT_ENOUGH_WORK, notEnoughWork: true }
  if (askedSoFar >= MAX_DEBRIEF_QUESTIONS) return { gaps: [], done: true, doneReason: `Question budget of ${MAX_DEBRIEF_QUESTIONS} used.` }
  const mustGuardrail = needGuardrail && askedSoFar === 0
  const rules = [
    `Questions left in the budget: ${MAX_DEBRIEF_QUESTIONS - askedSoFar}.`,
    askedSoFar < MIN_DEBRIEF_QUESTIONS
      ? `Debrief questions asked so far: ${askedSoFar}. At least ${MIN_DEBRIEF_QUESTIONS} are required in total, so do not set done before that.`
      : '',
    mustGuardrail
      ? 'No guardrail question was asked during the task. Your FIRST question MUST be kind "guardrail": a limit, a threshold, or when they would stop and ask someone, about the most important decision on screen.'
      : '',
  ].filter(Boolean)
  const out = await generateJson({
    model: MODELS.deep,
    schema: GapsSchema,
    system: GAPS_SYSTEM,
    content: `Session log:\n${formatLog(log)}\n\n${rules.join('\n')}`,
    effort: 'medium',
  })
  let found = out.gaps.map((g) => ({ question: g.question.trim(), kind: g.kind, aboutT: g.aboutT }))
  if (mustGuardrail) {
    const g = found.findIndex((x) => x.kind === 'guardrail')
    if (g > 0) found = [found[g], ...found.filter((_, i) => i !== g)]
    if (g < 0) {
      const lastScreen = [...log].reverse().find((l) => l.who === 'screen')
      found = [{ question: FALLBACK_GUARDRAIL_GAP, kind: 'guardrail', aboutT: lastScreen?.t ?? 0 }, ...found]
    }
  }
  const gaps = found.slice(0, Math.min(3, MAX_DEBRIEF_QUESTIONS - askedSoFar)).map(
    (g, i): Gap => ({ id: `gap-${askedSoFar + i + 1}`, question: g.question, kind: g.kind, clip: clipAround(g.aboutT) }),
  )
  const minimumReached = askedSoFar + gaps.length >= MIN_DEBRIEF_QUESTIONS
  return { gaps, done: gaps.length === 0 || (out.done && minimumReached), doneReason: out.doneReason }
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

export async function buildWorkMap(sessionId: string, log: LogLine[], expert = 'Sabine'): Promise<{ workMap: WorkMap; warnings: string[] }> {
  if (!hasEnoughWork(log)) throw new NotEnoughWorkError()
  const draft = await generateJson({
    model: MODELS.deep,
    schema: WorkMapDraftSchema,
    system: WORKMAP_SYSTEM,
    content: `Session log:\n${formatLog(log)}`,
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
    guardrails.push({ id: g.id, text: g.text.trim(), quote, when: [], require: [], severity: 'block' })
  }
  const known = new Set(guardrails.map((g) => g.id))

  const steps: Step[] = draft.steps.map((s, i) => {
    const id = `S${i + 1}`
    const reason = s.reasonQuote ? findExpertQuote(log, s.reasonQuote) : null
    if (s.reasonQuote && !reason) warnings.push(`Step "${s.title}": reason quote not found, left out.`)
    const start = Math.max(0, Math.min(s.startT, lastT))
    const end = Math.max(start + 10_000, Math.min(s.endT, start + 20_000))
    return {
      id,
      index: i + 1,
      title: s.title.trim(),
      ...(TARGET_IDS.includes(s.targetId) ? { targetId: s.targetId } : {}),
      clip: { start, end },
      decision: s.decision.trim(),
      ...(reason ? { reason } : {}),
      guardrailIds: s.guardrailIds.filter((g) => known.has(g)),
      isJudgmentCall: s.isJudgmentCall,
      confidence: Math.max(0, Math.min(1, reason || !s.reasonQuote ? s.confidence : s.confidence * 0.6)),
    }
  })
  // Each guardrail points back at the first step that uses it.
  for (const g of guardrails) g.stepId = steps.find((s) => s.guardrailIds.includes(g.id))?.id

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
