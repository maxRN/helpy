// Pure speech-turn logic on top of Scribe's events (no audio, no network), so it can be tested.
// partial transcript → the expert is talking right now; committed transcript (after VAD silence) → turn ended.

export interface Utterance {
  text: string
  startedAt: number // Date.now() of the first partial of this turn
  endedAt: number
  /** Set by claimAnswer() when this turn answers a question the agent asked. */
  answersQuestionId?: string
  aboutEventId?: string
}

export const ANSWER_WINDOW_MS = 45_000 // a turn later than this after a question is not its answer

const BACK_ON = /\b(back on the record|on the record again|resume recording|continue recording|start recording again|wieder (offiziell|aufnehmen)|aufnahme fortsetzen)\b/i
const GO_OFF = /\b(off the record|stop recording|pause recording|don'?t record( this)?|inoffiziell|nicht aufnehmen|aufnahme (stoppen|pausieren))\b/i

/** "Off the record" / "back on the record" spoken by the expert (English or German), else null. */
export function recordCommand(text: string): 'off' | 'on' | null {
  if (BACK_ON.test(text)) return 'on'
  if (GO_OFF.test(text)) return 'off'
  return null
}

// Cheap first filter: could this turn be meant for Helpy at all? Claude makes the real decision
// (/api/helpy/turn), so this only has to be generous: second person, Helpy's name, or a question.
const MAYBE_TO_HELPY = /\b(helpy|helpi|du|dir|dich|dein\w*|ihr|euch|you|your)\b|\?\s*$/i

export function mightBeToHelpy(text: string): boolean {
  return MAYBE_TO_HELPY.test(text.trim())
}

// Only when Claude cannot decide (no network, timeout): an obvious question back is still not an answer.
const QUESTION_BACK = /^\W*(wie meinst du|was meinst du|wie bitte|welche[rsn]? (rechnung|meinst)|was genau|kannst du (das|die frage)? ?(noch ?mal )?wiederholen|nochmal bitte|hä|what do you mean|what does that mean|which (one|invoice)|sorry\?|pardon|can you repeat|could you repeat|say that again)(?![\p{L}])/iu

/** A short reply that obviously asks back about Helpy's question (the fallback when Claude gives no verdict). */
export function looksLikeQuestionBack(text: string): boolean {
  const t = text.trim()
  return t.split(/\s+/).length <= 8 && QUESTION_BACK.test(t)
}

/** What a turn does with the question Helpy is waiting on (decided by Claude, /api/helpy/turn). */
export type TurnIntent = 'answer' | 'clarify' | 'skip' | 'other'

export interface TurnVerdict {
  toHelpy: boolean
  intent: TurnIntent
  reply: string
  language: 'de' | 'en' | 'keep'
  /** Teach-back only: the expert agreed without a correction. */
  confirmed?: boolean
}

/**
 * Keeps a verdict consistent: an answer is never a reply to Helpy, and without a question nothing is an answer.
 * A clarification always gets a reply: at least the question again (`question`), never silence.
 */
export function normalizeTurn(out: TurnVerdict, question?: string): TurnVerdict {
  const intent = question ? out.intent : 'other'
  const toHelpy = intent === 'answer' ? false : intent === 'clarify' || intent === 'skip' ? true : out.toHelpy
  const reply = toHelpy ? out.reply.trim() : ''
  return { ...out, intent, toHelpy, reply: intent === 'clarify' && !reply ? question! : reply }
}

/**
 * What to do with a finished turn while Helpy may be waiting for an answer:
 *  answer    → it is the answer to the open question (or plain narration when none is open)
 *  clarified → they asked back ("Wie meinst du das?"): Helpy explained, the same question stays open
 *  skipped   → they declined it: the question is closed without an answer
 *  toHelpy   → said to Helpy about something else: answered, the question stays open
 *  narration → about the work but not the answer: the question stays open
 * Without a verdict (Claude unavailable) a turn after a question counts as its answer, as before.
 */
export type TurnRoute = 'answer' | 'clarified' | 'skipped' | 'toHelpy' | 'narration'

export function routeTurn(verdict: Pick<TurnVerdict, 'toHelpy' | 'intent'> | null, questionOpen: boolean, text = ''): TurnRoute {
  if (!verdict) return questionOpen && looksLikeQuestionBack(text) ? 'clarified' : 'answer'
  if (questionOpen) {
    if (verdict.intent === 'answer') return 'answer'
    if (verdict.intent === 'clarify') return 'clarified'
    if (verdict.intent === 'skip') return 'skipped'
  }
  if (verdict.toHelpy) return 'toHelpy'
  return questionOpen ? 'narration' : 'answer'
}

export class SpeechTracker {
  private lastSpeech = 0
  private turnStart: number | null = null
  private partialText = ''
  private question: { id: string; eventId?: string; at: number; text?: string } | null = null

  /** Interim text while the expert speaks. Empty partials (noise) do not count as speech. */
  partial(text: string, now: number) {
    if (!text.trim()) return
    this.lastSpeech = now
    this.turnStart ??= now
    this.partialText = text
  }

  /** Final text of a turn. Returns the utterance, or null for an empty commit. */
  committed(text: string, now: number): Utterance | null {
    const clean = text.trim()
    const startedAt = this.turnStart ?? now
    this.turnStart = null
    this.partialText = ''
    if (!clean) return null
    this.lastSpeech = now
    return { text: clean, startedAt, endedAt: now }
  }

  /**
   * Links the turn to the agent's pending question if it came within the answer window, once.
   * Called only for turns that are about the work (not questions to Helpy).
   */
  claimAnswer(u: Utterance): Utterance {
    const q = this.question
    if (q && u.startedAt >= q.at && u.startedAt - q.at <= ANSWER_WINDOW_MS) {
      this.question = null
      return { ...u, answersQuestionId: q.id, aboutEventId: q.eventId }
    }
    return u
  }

  /** The agent asked something: the expert's next turn about the work is the answer. */
  questionAsked(id: string, eventId: string | undefined, now: number, text?: string) {
    this.question = { id, eventId, at: now, text }
  }

  /** The question still waiting for its answer (within the answer window), if any. */
  openQuestion(now: number): { id: string; text?: string } | null {
    const q = this.question
    return q && now - q.at <= ANSWER_WINDOW_MS ? { id: q.id, text: q.text } : null
  }

  /** Helpy explained its question again: the answer window starts over. */
  reopenQuestion(now: number) {
    if (this.question) this.question = { ...this.question, at: now }
  }

  /** The expert declined the question: nothing after this is its answer. */
  dropQuestion() {
    this.question = null
  }

  /** Forget the half-heard turn, e.g. when going off the record. */
  dropTurn() {
    this.turnStart = null
    this.partialText = ''
  }

  lastSpeechAt() {
    return this.lastSpeech
  }

  isSpeaking() {
    return this.turnStart !== null
  }

  currentPartial() {
    return this.partialText
  }
}
