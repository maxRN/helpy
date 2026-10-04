import { emit, getDeps, nowRel } from './deps';
import type { Mode, Quote, Speaker } from './types';

/** Shape of what the ElevenLabs SDK passes to onMessage. Verify against the current SDK (hour 0-2). */
export interface RawMessage {
  source?: string; // 'user' | 'ai'
  role?: string; // 'user' | 'agent'
  message?: string;
  text?: string;
  isFinal?: boolean;
}

// Messages WE send to the agent come back as "user" messages. Never log them as the expert talking.
const CONTROL = /^\s*\[(ASK|SAY|TEACHBACK|INTERVENE|PREDICT|NUDGE|SCREEN|WORKMAP|GUIDE)\b/i;

const TURN_END_MS = 1500; // expert silence that ends an answer
const ARM_FALLBACK_MS = 6000; // start listening for the answer even if we never saw the agent speak

export interface TranscriptOpts {
  mode: Mode;
  isOffRecord(): boolean;
  /** Called for every user line (also off the record) so silence tracking stays correct. */
  onUserSpeech(): void;
  /** Epoch ms when the current user speech started (from VAD); returns and clears it. */
  takeSpeechStart(): number | null;
  onAnswer?(q: Quote): void;
}

interface Collector {
  questionId: string;
  eventId?: string;
  /** false: the caller decides whether the reply is the answer and logs it (see expect). */
  emit?: boolean;
  armed: boolean;
  agentSpoke: boolean;
  resolve: (q: Quote) => void;
  reject: (e: Error) => void;
  timers: ReturnType<typeof setTimeout>[];
}

export function createTranscript(opts: TranscriptOpts) {
  const userSpeaker: Speaker = opts.mode === 'teach' ? 'trainee' : 'expert';
  const tailBuf: { speaker: Speaker; text: string }[] = [];
  const userLines: { text: string; t: number }[] = []; // the expert's own words, for corrections
  let collector: Collector | null = null;
  let chunks: { text: string; t: number }[] = [];
  let turnTimer: ReturnType<typeof setTimeout> | null = null;

  function lineTime(isUser: boolean): number {
    const received = nowRel();
    if (!isUser) return received;
    const start = opts.takeSpeechStart();
    // Final transcripts arrive after the speech ended; use the VAD start if it is recent.
    if (start && Date.now() - start < 30_000) return Math.max(0, start - getDeps().session.t0);
    return received;
  }

  function ingest(raw: RawMessage): void {
    if (raw.isFinal === false) return; // ignore tentative transcripts
    const text = (raw.message ?? raw.text ?? '').trim();
    if (!text || CONTROL.test(text)) return;

    const isUser = raw.source === 'user' || raw.role === 'user';
    if (isUser) opts.onUserSpeech();
    if (opts.isOffRecord()) return; // nothing is stored off the record

    const speaker: Speaker = isUser ? userSpeaker : 'agent';
    const t = lineTime(isUser);
    emit({ type: 'utterance', speaker, text, t, meta: { mode: opts.mode, receivedAt: nowRel() } });

    tailBuf.push({ speaker, text });
    if (tailBuf.length > 20) tailBuf.shift();
    if (isUser) {
      userLines.push({ text, t });
      if (userLines.length > 40) userLines.shift();
    }

    if (isUser && collector?.armed) {
      chunks.push({ text, t });
      if (turnTimer) clearTimeout(turnTimer);
      turnTimer = setTimeout(flushTurn, TURN_END_MS);
    }
  }

  function flushTurn(): void {
    const c = collector;
    if (!c || !chunks.length) return;
    const quote: Quote = {
      text: chunks.map((x) => x.text).join(' '),
      t: chunks[0].t,
      speaker: userSpeaker,
      eventId: c.eventId,
    };
    chunks = [];
    clearCollector(c);
    collector = null;
    if (c.emit !== false) {
      emit({
        type: 'answer_given',
        speaker: userSpeaker,
        text: quote.text,
        t: quote.t,
        meta: { questionId: c.questionId, eventId: c.eventId },
      });
      opts.onAnswer?.(quote);
    }
    c.resolve(quote);
  }

  function clearCollector(c: Collector): void {
    c.timers.forEach(clearTimeout);
    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = null;
  }

  /**
   * Wait for the expert's answer to a question we just asked.
   * Starts listening once the agent has finished speaking the question.
   * Resolves when the expert's turn ends (1.5 s of silence). Rejects on timeout.
   * `armed`: listen right away (e.g. for the real answer after a question back), unless the agent is talking.
   * `emit: false`: the reply is not logged as the answer yet; the caller first decides whether it is one.
   */
  function expect(o: { questionId: string; eventId?: string; timeoutMs: number; armed?: boolean; agentSpeaking?: boolean; emit?: boolean }): Promise<Quote> {
    if (collector) {
      clearCollector(collector);
      collector.reject(new Error('superseded by a newer question'));
      collector = null;
      chunks = [];
    }
    return new Promise<Quote>((resolve, reject) => {
      const { armed, agentSpeaking, ...rest } = o;
      // Agent talking right now: start listening when it is done; else listen at once if asked to.
      const c: Collector = { ...rest, armed: !!armed && !agentSpeaking, agentSpoke: !!agentSpeaking, resolve, reject, timers: [] };
      c.timers.push(setTimeout(() => (c.armed = true), ARM_FALLBACK_MS));
      c.timers.push(
        setTimeout(() => {
          if (collector !== c) return;
          clearCollector(c);
          collector = null;
          reject(new Error('answer timeout'));
        }, o.timeoutMs),
      );
      collector = c;
    });
  }

  return {
    ingest,
    expect,
    agentStarted: () => {
      if (collector) collector.agentSpoke = true;
    },
    agentFinished: () => {
      if (collector?.agentSpoke) collector.armed = true;
    },
    tail: (n = 6) => tailBuf.slice(-n),
    /** What the expert said since `t` (ms on the session clock), in their own words. */
    userSince: (t: number) => userLines.filter((l) => l.t >= t).map((l) => l.text),
    dispose: () => {
      if (collector) {
        clearCollector(collector);
        collector.reject(new Error('session ended'));
        collector = null;
      }
      chunks = [];
    },
  };
}

export type TranscriptHandle = ReturnType<typeof createTranscript>;
