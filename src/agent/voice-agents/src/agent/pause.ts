// Answer to judge question 1: "When to ask?"
// A moment counts as a pause only if ALL conditions hold. Every transition is logged
// together with the reasons that blocked it, so you can show the log in Q&A.

export interface PauseInputs {
  now: number; // Date.now()
  lastInputAt: number; // last key/click/scroll (P1)
  lastFrameChangeAt: number; // last visible change on screen (P3)
  userSilentForMs: number; // how long the expert has not spoken
  agentSpeaking: boolean;
  offRecord: boolean;
}

export interface PauseResult {
  pause: boolean;
  blockers: string[]; // empty when pause === true
}

export const PAUSE_THRESHOLDS = {
  sinceInputMs: 2500,
  sinceFrameChangeMs: 2000,
  userSilentMs: 1200,
} as const;

export function isPause(i: PauseInputs, th: typeof PAUSE_THRESHOLDS = PAUSE_THRESHOLDS): PauseResult {
  const blockers: string[] = [];
  const sinceInput = i.now - i.lastInputAt;
  const sinceFrame = i.now - i.lastFrameChangeAt;

  if (sinceInput < th.sinceInputMs) blockers.push(`typing/clicking ${sinceInput}ms ago`);
  if (sinceFrame < th.sinceFrameChangeMs) blockers.push(`screen changed ${sinceFrame}ms ago`);
  if (i.userSilentForMs < th.userSilentMs) blockers.push(`expert speaking (silent ${i.userSilentForMs}ms)`);
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
