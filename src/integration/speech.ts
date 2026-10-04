// Pure speech-turn logic on top of Scribe's events (no audio, no network), so it can be tested.
// partial transcript → the expert is talking right now; committed transcript (after VAD silence) → turn ended.

export interface Utterance {
  text: string
  startedAt: number // Date.now() of the first partial of this turn
  endedAt: number
  /** Set when this turn answers a question the agent asked. */
  answersQuestionId?: string
  aboutEventId?: string
}

export const ANSWER_WINDOW_MS = 45_000 // a turn later than this after a question is not its answer

export class SpeechTracker {
  private lastSpeech = 0
  private turnStart: number | null = null
  private partialText = ''
  private question: { id: string; eventId?: string; at: number } | null = null

  /** Interim text while the expert speaks. Empty partials (noise) do not count as speech. */
  partial(text: string, now: number) {
    if (!text.trim()) return
    this.lastSpeech = now
    this.turnStart ??= now
    this.partialText = text
  }

  /** Final text of a turn. Returns the utterance to log, or null for an empty commit. */
  committed(text: string, now: number): Utterance | null {
    const clean = text.trim()
    const startedAt = this.turnStart ?? now
    this.turnStart = null
    this.partialText = ''
    if (!clean) return null
    this.lastSpeech = now
    const u: Utterance = { text: clean, startedAt, endedAt: now }
    if (this.question && startedAt - this.question.at <= ANSWER_WINDOW_MS && startedAt >= this.question.at) {
      u.answersQuestionId = this.question.id
      u.aboutEventId = this.question.eventId
      this.question = null
    }
    return u
  }

  /** The agent asked something: the expert's next turn is the answer. */
  questionAsked(id: string, eventId: string | undefined, now: number) {
    this.question = { id, eventId, at: now }
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
