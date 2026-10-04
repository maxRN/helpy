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

const BACK_ON = /\b(back on the record|on the record again|resume recording|continue recording|start recording again|wieder (offiziell|aufnehmen)|aufnahme fortsetzen)\b/i
const GO_OFF = /\b(off the record|stop recording|pause recording|don'?t record( this)?|inoffiziell|nicht aufnehmen|aufnahme (stoppen|pausieren))\b/i

const BY_NAME = /\bhelp(y|i|ie)\b/i
// Questions clearly aimed at Helpy itself (hearing, speaking, answering), not team chatter.
const TO_HELPY =
  /\b(hörst du( mich)?|kannst du (mich )?(hören|verstehen|antworten|sprechen|reden)|kannst du (auch )?(auf )?(deutsch|englisch)|verstehst du( mich)?|bist du (da|bereit)|warum (antwortest|sagst|redest|sprichst) du|antwortest du|sprichst du|can you hear( me)?|do you hear( me)?|are you (there|listening)|can you (answer|speak|talk|understand|respond)|why (aren'?t|don'?t|do not|are not) you (answering|talking|saying|answer|talk|respond)|do you speak)\b/i

/** The expert spoke to Helpy directly ("Helpy, …", "hörst du mich?", "can you hear me?"). */
export function isDirectAddress(text: string): boolean {
  return BY_NAME.test(text) || TO_HELPY.test(text)
}

/** "Off the record" / "back on the record" spoken by the expert (English or German), else null. */
export function recordCommand(text: string): 'off' | 'on' | null {
  if (BACK_ON.test(text)) return 'on'
  if (GO_OFF.test(text)) return 'off'
  return null
}

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

  /**
   * Final text of a turn. Returns the utterance to log, or null for an empty commit.
   * canAnswer = false (e.g. a question to Helpy) keeps the pending question open for the real answer.
   */
  committed(text: string, now: number, canAnswer = true): Utterance | null {
    const clean = text.trim()
    const startedAt = this.turnStart ?? now
    this.turnStart = null
    this.partialText = ''
    if (!clean) return null
    this.lastSpeech = now
    const u: Utterance = { text: clean, startedAt, endedAt: now }
    if (canAnswer && this.question && startedAt - this.question.at <= ANSWER_WINDOW_MS && startedAt >= this.question.at) {
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
