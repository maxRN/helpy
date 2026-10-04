// Shared types for the voice layer (P2).
// AppEvent / Quote shapes MUST be agreed with P1 and P3. If theirs differ,
// change them here and in deps.ts only; nothing else needs to move.

export type Mode = 'capture' | 'debrief' | 'teach';
export type Speaker = 'expert' | 'trainee' | 'agent';
export type QuestionKind = 'why' | 'guardrail' | 'exception';

/** Event on the shared bus. `t` = ms since session.t0. */
export interface AppEvent {
  id: string;
  t: number;
  type: string; // 'utterance' | 'question_asked' | 'answer_given' | 'dom' | 'vision' | ...
  speaker?: Speaker;
  text?: string;
  meta?: Record<string, unknown>;
}

/** An answer (or any spoken line) with its timing. */
export interface Quote {
  text: string;
  t: number; // ms since session.t0 (start of the answer)
  speaker: Speaker;
  eventId?: string; // screen event the question was about
}

export interface Guardrail {
  id: string;
  rule: string;
  quote: string;
  stepId: string;
}

/** Event types that describe what is on screen (from P1 dom / P3 vision). */
export const SCREEN_EVENT_TYPES = new Set(['dom', 'vision']);

// ---- question policy ----

export interface QaRecord {
  question: string;
  kind: QuestionKind;
  eventId?: string;
  t: number;
  answer?: string;
}

export interface PolicyRequest {
  events: { id: string; t: number; text: string }[];
  history: QaRecord[];
  transcriptTail: { speaker: Speaker; text: string }[];
  budget: { questionsLeft: number; forceGuardrail: boolean };
  /** Language Helpy speaks with the expert (they can ask for German). Default English. */
  language?: 'de' | 'en';
  /** What is visible right now, with the age of each source (see src/shared/screen.ts). */
  screen?: string;
}

export interface PolicyResponse {
  ask: boolean;
  question?: string;
  eventId?: string;
  kind?: QuestionKind;
  reason?: string;
}

// ---- what we need from the other people's modules ----
// All timestamps from activity/capture are Date.now() epoch ms.
// session.t0 is Date.now() at session start.

export interface Deps {
  bus: {
    emit(e: AppEvent): void;
    /** type '*' = every event. Returns an unsubscribe function. */
    on(type: string, fn: (e: AppEvent) => void): () => void;
  };
  session: { t0: number };
  /** P1. Typing only: pointer movement, clicks and scrolling never hold a question back. */
  activity: { lastTypingAt(): number; /** Optional: last click or focus in a form control (epoch ms). */ lastFieldAt?(): number };
  /**
   * Optional: Scribe v2 Realtime listening in Capture mode (src/integration/listener.ts).
   * When active, the agent's own mic is muted in Capture, and speech activity comes from Scribe's VAD.
   * turnOpen: the expert is mid-turn (Scribe has not committed it yet, i.e. no endpoint so far).
   * replyPending: a finished turn might be meant for Helpy and is being decided or answered.
   */
  speech?: { lastSpeechAt(): number; active(): boolean; turnOpen?(): boolean; replyPending?(): boolean };
  /** Optional: Helpy is talking outside the agent (TTS); the pause detector treats it like the agent speaking. */
  isSpeaking?(): boolean;
  /** Optional: the language Helpy speaks with the expert ('de' after they asked for German). */
  language?(): 'de' | 'en';
  /** Optional: invoice numbers in `text` that do not exist in the app (never say those). */
  ungroundedRefs?(text: string): string[];
  /** Optional: what is on the user's screen right now, for the agent's context (every mode). ages: false = stable text. */
  screen?(opts?: { ages?: boolean }): string;
  mascot: {
    // P4
    setState(s: 'idle' | 'listening' | 'speaking' | 'thinking'): void;
    bubble(text: string | null): void;
    pointTo(targetId: string): void;
    /** A question is ready but the expert is busy (null = none). P4 raises a hand instead of interrupting. */
    waiting?(question: string | null): void;
  };
  getNextStep(): { stepId: string; targetId: string; text: string } | null; // P1
  showExpertClip(stepId: string): void; // P4
  /** Work Map as compact markdown for the tutor (P3). Optional until hour 10. */
  getWorkMapMarkdown?(): string;
  /** Optional: which guardrails match an invoice's fields (for "predict"). */
  matchGuardrails?(fields: Record<string, unknown>): Guardrail[];
}
