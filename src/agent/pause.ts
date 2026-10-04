// Answer to judge question 1: "When to ask?"
// A moment counts as a pause only if ALL conditions hold. Every transition is logged
// together with the reasons that blocked it, so you can show the log in Q&A.
//
// Only the expert's typing and speech hold a question back. Mouse movement, clicks, scrolling and
// screen changes never do: someone who reads with the mouse in hand is still at a natural pause.

export interface PauseInputs {
  now: number; // Date.now()
  lastTypingAt: number; // last keystroke (P1), epoch ms
  /** How long the expert has not spoken (epoch-based, from Scribe's or the agent's VAD). */
  userSilentForMs: number;
  /**
   * Speech endpointing is available (Scribe v2 Realtime): a turn is open from its first partial
   * transcript until Scribe commits it after its own VAD silence. Then `turnOpen` decides, with no
   * extra delay on top of Scribe's endpoint.
   */
  endpointing?: boolean;
  turnOpen?: boolean;
  /**
   * Last click or focus in a form control (field, dropdown, button) of the work app, epoch ms.
   * Someone clicking into fields is mid-step ("what will you enter?" makes no sense yet): hold questions.
   * Plain mouse movement while reading is still not an input.
   */
  lastFieldAt?: number;
  /** A finished turn might be addressed to Helpy and is being decided or answered right now. */
  replyPending?: boolean;
  /**
   * The expert is in the middle of an invoice: they changed something on it and have not finished it yet (post,
   * hold, second approval) nor left it. A short breath there is not a pause; only a long quiet moment is.
   */
  midTask?: boolean;
  agentSpeaking: boolean;
  offRecord: boolean;
}

export interface PauseResult {
  pause: boolean;
  blockers: string[]; // empty when pause === true
}

export const PAUSE_THRESHOLDS = {
  sinceTypingMs: 2500,
  /** Without endpointing (agent VAD only): silence that counts as the end of speech. */
  userSilentMs: 1200,
  /** With endpointing: an open turn without any new speech for this long is stale (e.g. a lost commit). */
  staleTurnMs: 6000,
  /**
   * With endpointing: silence after a finished turn before Helpy may speak. Scribe ends a turn after
   * 0.8 s of silence, which is often just a breath between two sentences; asking right then interrupts.
   */
  afterTurnMs: 1500,
  /** After a click or focus in a form control: the expert is in the middle of a step. */
  sinceFieldMs: 4000,
  /** In the middle of an invoice: no typing, no field and no speech for this long before Helpy may ask. */
  midTaskQuietMs: 8000,
} as const;

export function isPause(i: PauseInputs, th: typeof PAUSE_THRESHOLDS = PAUSE_THRESHOLDS): PauseResult {
  const blockers: string[] = [];
  const sinceTyping = i.now - i.lastTypingAt;

  if (sinceTyping < th.sinceTypingMs) blockers.push(`typing ${sinceTyping}ms ago`);
  if (i.lastFieldAt !== undefined && i.now - i.lastFieldAt < th.sinceFieldMs) {
    blockers.push(`working in a field ${i.now - i.lastFieldAt}ms ago`);
  }
  if (i.endpointing) {
    if (i.turnOpen && i.userSilentForMs < th.staleTurnMs) blockers.push('expert speaking (turn open)');
    else if (!i.turnOpen && i.userSilentForMs < th.afterTurnMs) blockers.push(`expert just finished a sentence ${i.userSilentForMs}ms ago`);
  } else if (i.userSilentForMs < th.userSilentMs) {
    blockers.push(`expert speaking (silent ${i.userSilentForMs}ms)`);
  }
  if (i.midTask) {
    const quietFor = Math.min(sinceTyping, i.lastFieldAt === undefined ? Infinity : i.now - i.lastFieldAt, i.userSilentForMs);
    if (quietFor < th.midTaskQuietMs) blockers.push(`in the middle of an invoice (quiet ${quietFor}ms)`);
  }
  if (i.replyPending) blockers.push('answering the expert');
  if (i.agentSpeaking) blockers.push('agent speaking');
  if (i.offRecord) blockers.push('off the record');

  return { pause: blockers.length === 0, blockers };
}

// ---- decision log (show this to judges) ----

export interface PauseLogEntry {
  t: number; // ms since session.t0 when available, else Date.now()
  pause: boolean;
  blockers: string[];
  note?: string; // e.g. "asked: ...", "skipped: budget"
}

const LOG_MAX = 300;
const log: PauseLogEntry[] = [];

export function logPause(entry: PauseLogEntry): void {
  log.push(entry);
  if (log.length > LOG_MAX) log.shift();
  console.debug('[pause]', entry.pause ? 'PAUSE' : 'busy', entry.blockers.join(' | '), entry.note ?? '');
}

export const getPauseLog = (): readonly PauseLogEntry[] => log;
export const clearPauseLog = (): void => {
  log.length = 0;
};

// ---- loop ----

export interface PauseLoopOpts {
  getInputs: () => PauseInputs;
  /** Called on the rising edge of a pause, then again every retryMs while it lasts. */
  onPause: (r: PauseResult) => void | Promise<void>;
  intervalMs?: number; // default 250
  retryMs?: number; // default 3000
}

export function startPauseLoop(o: PauseLoopOpts): () => void {
  const interval = o.intervalMs ?? 250;
  const retry = o.retryMs ?? 3000;
  let was = false;
  let lastFire = 0;

  const id = setInterval(() => {
    const inputs = o.getInputs();
    const r = isPause(inputs);

    if (r.pause !== was) logPause({ t: inputs.now, pause: r.pause, blockers: r.blockers });

    if (r.pause && (!was || inputs.now - lastFire >= retry)) {
      lastFire = inputs.now;
      void o.onPause(r);
    }
    was = r.pause;
  }, interval);

  return () => clearInterval(id);
}
