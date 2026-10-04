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
