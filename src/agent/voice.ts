// agent/voice.ts: the public API of the voice layer.
//   start(mode), stop(), ask(q): Promise<Quote>, say(text)
// Extras: teachBack(text), setOffRecord(on), getPauseLog()
//
// Uses the framework-agnostic client from @elevenlabs/client (re-exported by @elevenlabs/react),
// so this is a plain module, not a React hook. Call setDeps() once before start().

import { emit, getDeps, nowRel } from './deps';
import { MOCK_WORK_MAP } from './mockWorkMap';
import { startPauseLoop, type PauseInputs } from './pause';
import { createQuestionPolicy, type DeliveryControl, type QuestionPolicy } from './policy';
import { buildClientTools } from './tools';
import { startScreenFeed } from './screenFeed';
import { createTranscript, type TranscriptHandle } from './transcript';
import type { Deps, Mode, Quote, Speaker } from './types';

export { getPauseLog } from './pause';

type ElevenClient = typeof import('@elevenlabs/client');
type Session = Awaited<ReturnType<ElevenClient['Conversation']['startSession']>>;

// ---- module state (one conversation at a time) ----
let conv: Session | null = null;
let mode: Mode | null = null;
let agentSpeaking = false;
let offRecord = false;
let lastUserSpeechAt = 0;
let speechStartAt: number | null = null;
let transcript: TranscriptHandle | null = null;
let policy: QuestionPolicy | null = null;
let cleanup: Array<() => void> = [];
let sayWaiters: Array<{ resolve: () => void; spoke: boolean }> = [];
let teachback: {
  resolve: (r: { confirmed: boolean; correction?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

export const isConnected = (): boolean => conv !== null;

// Capture without an agent (none configured or it failed to start): same pause detector and
// question policy, questions spoken by plain TTS, answers heard by Scribe.
let lite = false;
// Bumped by stop(): a start() that finishes connecting after a stop() closes its session instead of using it.
let startGen = 0;

/** True while live questions can be asked: with the agent, or in Capture without one. */
export const isActive = (): boolean => conv !== null || lite;

export function startCaptureWithoutAgent(say: Deliver): void {
  if (conv || lite) return;
  const deps = getDeps();
  mode = 'capture';
  lite = true;
  agentSpeaking = false;
  offRecord = false;
  lastUserSpeechAt = 0;
  deps.mascot.setState('listening');
  startCapture(deps, say);
}

function requireConn(): Session {
  if (!conv) throw new Error('[voice] not connected: call start(mode) first');
  return conv;
}

// ---------------------------------------------------------------- start / stop

export async function start(m: Mode, opts: { workMapMarkdown?: string } = {}): Promise<void> {
  if (conv || lite) await stop();
  const gen = ++startGen;
  const deps = getDeps();

  mode = m;
  agentSpeaking = false;
  offRecord = false;
  lastUserSpeechAt = 0;
  speechStartAt = null;

  const agent = m === 'teach' ? 'tutor' : 'interviewer';
  const res = await fetch(`/api/elevenlabs/signed-url?agent=${agent}`);
  if (!res.ok) throw new Error(`[voice] signed-url failed (${res.status})`);
  const { signedUrl } = (await res.json()) as { signedUrl: string };

  transcript = createTranscript({
    mode: m,
    isOffRecord: () => offRecord,
    onUserSpeech: () => {
      lastUserSpeechAt = Date.now();
    },
    takeSpeechStart: () => {
      const s = speechStartAt;
      speechStartAt = null;
      return s;
    },
    onAnswer: (q) => {
      deps.mascot.bubble(null);
      policy?.recordAnswer(q);
    },
  });

  const tools = buildClientTools({
    setOffRecord: (on) => setOffRecord(on, 'voice'),
    resolveTeachback: settleTeachback,
  });

  const workMap = opts.workMapMarkdown ?? deps.getWorkMapMarkdown?.() ?? MOCK_WORK_MAP;

  // Loaded lazily so TanStack Start's server render never touches browser-only SDK code.
  const { Conversation } = await import('@elevenlabs/client');

  const started = await Conversation.startSession({
    signedUrl,
    connectionType: 'websocket',
    clientTools: tools,
    ...(m === 'teach' ? { dynamicVariables: { work_map: workMap } } : {}),

    onMessage: (msg) => transcript?.ingest(msg),

    onModeChange: ({ mode: agentMode }) => {
      if (agentMode === 'speaking') {
        agentSpeaking = true;
        transcript?.agentStarted();
        sayWaiters.forEach((w) => (w.spoke = true));
        deps.mascot.setState('speaking');
      } else if (agentSpeaking) {
        agentSpeaking = false;
        transcript?.agentFinished();
        deps.mascot.setState('listening');
        const done = sayWaiters.filter((w) => w.spoke);
        sayWaiters = sayWaiters.filter((w) => !w.spoke);
        done.forEach((w) => w.resolve());
      }
    },

    // Voice activity: real-time "the expert is talking" signal (needs the vad_score client event enabled).
    onVadScore: (p: unknown) => {
      const score = typeof p === 'number' ? p : ((p as { vadScore?: number })?.vadScore ?? 0);
      if (score < 0.5 || agentSpeaking) return; // ignore our own voice leaking into the mic
      const now = Date.now();
      if (now - lastUserSpeechAt > 1200) speechStartAt = now;
      lastUserSpeechAt = now;
    },

    onError: (e: unknown) => console.error('[voice] error', e),
    onDisconnect: () => {
      if (conv) void stop();
    },
  });
  // stop() ran while we were connecting (e.g. the app gave up waiting): close this late session.
  if (gen !== startGen) {
    void started.endSession().catch(() => undefined);
    return;
  }
  conv = started;

  deps.mascot.setState('listening');
  // Capture with Scribe listening: the agent must not hear (or answer) the narration; it only speaks on [ASK].
  if (m === 'capture' && deps.speech?.active()) conv.setMicMuted(true);
  cleanup.push(startAgentScreenFeed(deps));

  if (m === 'capture') {
    startCapture(deps, (q) => {
      conv?.sendUserMessage(`[ASK] ${q}`);
      return true;
    });
  }
  if (m === 'teach') cleanup.push(wireTutor(deps));
}

export async function stop(): Promise<void> {
  startGen++;
  cleanup.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  cleanup = [];
  transcript?.dispose();
  transcript = null;
  policy?.dispose();
  policy = null;
  settleTeachback({ confirmed: false, correction: '(session ended)' });
  sayWaiters.splice(0).forEach((w) => w.resolve());

  const c = conv;
  conv = null;
  lite = false;
  mode = null;
  agentSpeaking = false;
  try {
    await c?.endSession();
  } catch (e) {
    console.warn('[voice] endSession failed', e);
  }
}

// ---------------------------------------------------------------- ask / say / teach-back

/** Debrief: speak a question, resolve with the expert's answer when their turn ends. */
export async function ask(question: string): Promise<Quote> {
  const c = requireConn();
  const deps = getDeps();
  const qe = emit({ type: 'question_asked', speaker: 'agent', text: question, meta: { phase: mode } });
  const answer = transcript!.expect({ questionId: qe.id, timeoutMs: 120_000 });
  deps.mascot.setState('speaking');
  deps.mascot.bubble(question);
  c.sendUserMessage(`[ASK] ${question}`);
  return answer;
}

/** Speak text verbatim. Resolves when the agent has finished speaking (or after 30 s). */
export function say(text: string): Promise<void> {
  const c = requireConn();
  return new Promise<void>((resolve) => {
    const waiter = { resolve, spoke: false };
    sayWaiters.push(waiter);
    setTimeout(() => {
      if (sayWaiters.includes(waiter)) {
        sayWaiters = sayWaiters.filter((w) => w !== waiter);
        resolve();
      }
    }, 30_000);
    c.sendUserMessage(`[SAY] ${text}`);
  });
}

/**
 * Debrief: read the process back (text from P3), then the agent asks "Is that how it works?"
 * and calls the confirm_teachback tool. Resolves with the expert's verdict.
 */
export function teachBack(text: string): Promise<{ confirmed: boolean; correction?: string }> {
  const c = requireConn();
  return new Promise((resolve) => {
    const timer = setTimeout(() => settleTeachback({ confirmed: false, correction: '(no response)' }), 180_000);
    teachback = { resolve, timer };
    emit({ type: 'teachback_given', speaker: 'agent', text });
    c.sendUserMessage(`[TEACHBACK] ${text}`);
  });
}

function settleTeachback(r: { confirmed: boolean; correction?: string }): void {
  if (!teachback) return;
  const t = teachback;
  teachback = null;
  clearTimeout(t.timer);
  emit({ type: 'teachback_result', speaker: 'expert', text: r.correction, meta: { confirmed: r.confirmed } });
  t.resolve(r);
}

/** When the expert last spoke: the agent's own VAD, or Scribe while it listens. 0 = not yet. */
export function lastExpertSpeechAt(): number {
  let scribe = 0;
  try {
    scribe = getDeps().speech?.lastSpeechAt() ?? 0;
  } catch {
    /* deps not set yet */
  }
  return Math.max(lastUserSpeechAt, scribe);
}

/** Capture: the expert invited the question Helpy is holding back (raised hand). false = none waiting. */
export function askWaitingQuestion(): boolean {
  return policy?.askReadyNow() ?? false;
}

/**
 * Capture is ending: ask the live questions still owed (fewer than three, or none about a guardrail), each
 * at a pause, about decisions still unexplained on screen. Resolves with the coverage reached.
 */
export async function wrapUpCapture(opts: { cancelled?: () => boolean; onStart?: (owed: number) => void } = {}) {
  return (await policy?.wrapUp(opts)) ?? { asked: 0, hasGuardrail: false };
}

/** Live question coverage so far (null outside Capture). */
export const captureStats = () => policy?.stats() ?? null;

/** An answer heard outside the agent (Scribe in Capture): goes into the question history like the agent's own. */
export function noteAnswer(q: Quote): void {
  getDeps().mascot.bubble(null);
  policy?.recordAnswer(q);
}

// ---------------------------------------------------------------- off the record

/** source 'voice' = the agent's tool call (agent already confirmed aloud); 'ui' = P4's button. */
export function setOffRecord(on: boolean, source: 'voice' | 'ui' = 'ui'): void {
  if (offRecord === on) return;
  offRecord = on;
  emit({ type: on ? 'off_record_start' : 'off_record_end', meta: { source } });
  if (source === 'ui' && conv) {
    conv.sendUserMessage(`[SAY] ${on ? 'Okay, off the record.' : 'Back on the record.'}`);
  }
}

// ---------------------------------------------------------------- capture mode

/**
 * How a live question is spoken: by the agent, or (without one) by plain TTS. Resolves false when it
 * was not said because the expert became busy before the voice started (see DeliveryControl).
 */
type Deliver = (question: string, control: DeliveryControl) => Promise<boolean> | boolean;

function startCapture(deps: Deps, deliver: Deliver): void {
  // What was said lately, from the shared bus: Scribe's turns (the agent's mic is muted in Capture) and the agent's lines.
  const heard: { speaker: Speaker; text: string }[] = [];
  cleanup.push(
    deps.bus.on('*', (e) => {
      if ((e.type === 'utterance' || e.type === 'question_asked') && e.text && e.meta?.toHelpy !== true) {
        heard.push({ speaker: e.speaker ?? 'expert', text: e.text });
        if (heard.length > 20) heard.shift();
      }
    }),
  );
  const tail = (n: number) => {
    const own = transcript?.tail(n) ?? [];
    return (heard.length >= own.length ? heard : own).slice(-n);
  };

  const getInputs = (): PauseInputs => {
    const now = Date.now();
    // Scribe's VAD (when listening) and the agent's own VAD: whichever heard speech last.
    const lastSpeech = Math.max(lastUserSpeechAt, deps.speech?.lastSpeechAt() ?? 0);
    // Scribe's endpointing: the expert is talking until Scribe commits the turn (no extra delay after that).
    const endpointing = (deps.speech?.active() ?? false) && !!deps.speech?.turnOpen;
    return {
      now,
      lastTypingAt: deps.activity.lastTypingAt(),
      userSilentForMs: now - lastSpeech,
      endpointing,
      turnOpen: endpointing ? deps.speech!.turnOpen!() : undefined,
      replyPending: deps.speech?.replyPending?.() ?? false,
      // The agent, or Helpy's own TTS (questions, replies) when it speaks without the agent.
      agentSpeaking: agentSpeaking || (deps.isSpeaking?.() ?? false),
      offRecord,
    };
  };

  policy = createQuestionPolicy({
    getInputs,
    tail,
    deliver,
    noteQuestion: ({ questionEventId, eventId }) => {
      // Live answers are only logged, nobody awaits them.
      transcript?.expect({ questionId: questionEventId, eventId, timeoutMs: 45_000 }).catch(() => undefined);
    },
  });

  cleanup.push(startPauseLoop({ getInputs, onPause: (r) => policy?.onPause(r) }));

  // While the expert types, tell the agent so it never talks over them (it holds ~2 s per signal).
  const keepQuiet = setInterval(() => {
    if (conv && Date.now() - deps.activity.lastTypingAt() < 1500) conv.sendUserActivity();
  }, 1000);
  cleanup.push(() => clearInterval(keepQuiet));
}

// ---------------------------------------------------------------- screen events -> agent context

/** Screen events and the current screen go into the agent's context (see screenFeed.ts). */
function startAgentScreenFeed(deps: Deps): () => void {
  const feed = startScreenFeed({
    send: (text) => conv?.sendContextualUpdate(text),
    screen: deps.screen ? () => deps.screen!({ ages: false }) : undefined,
    isOffRecord: () => offRecord,
    now: () => nowRel(),
  });
  const off = deps.bus.on('*', (e) => feed.onEvent(e));
  return () => {
    off();
    feed.dispose();
  };
}

// ---------------------------------------------------------------- tutor interventions

/**
 * Expected event shapes from P1 (adjust the meta keys here if theirs differ):
 *  guardrail_violation: meta { guardrailId, rule, quote, stepId, invoiceId }
 *  sequence_deviation:  meta { stepName, stepId }
 *  invoice_opened:      meta { invoiceId, fields }
 */
function wireTutor(deps: Deps): () => void {
  const lastSent = new Map<string, number>();
  const allow = (key: string, ms: number): boolean => {
    const now = Date.now();
    if ((lastSent.get(key) ?? 0) + ms > now) return false;
    lastSent.set(key, now);
    return true;
  };

  return deps.bus.on('*', (e) => {
    if (!conv) return;
    const m = e.meta ?? {};

    switch (e.type) {
      case 'guardrail_violation': {
        if (!allow(`g:${m.guardrailId}`, 15_000)) return;
        conv.sendUserMessage(
          `[INTERVENE] ${m.stage === 'decision' ? 'The trainee just made this decision' : 'The trainee tried to post'}, which breaks guardrail ${m.guardrailId ?? '?'}: ${m.rule ?? e.text ?? ''}. ` +
            `Expert quote: "${m.quote ?? ''}". Step: ${m.stepId ?? '?'}. Invoice: ${m.invoiceId ?? '?'}.`,
        );
        emit({ type: 'tutor_intervention', speaker: 'agent', meta: { kind: 'guardrail', ...m } });
        break;
      }
      case 'sequence_deviation': {
        if (!allow(`s:${m.stepId}`, 20_000)) return;
        conv.sendUserMessage(`[NUDGE] The trainee skipped step "${m.stepName ?? m.stepId ?? '?'}". Ask softly if it was on purpose.`);
        emit({ type: 'tutor_intervention', speaker: 'agent', meta: { kind: 'sequence', ...m } });
        break;
      }
      case 'invoice_opened': {
        const hits = deps.matchGuardrails?.((m.fields as Record<string, unknown>) ?? {}) ?? [];
        if (!hits.length || !allow(`p:${m.invoiceId}`, 60_000)) return;
        conv.sendUserMessage(
          `[PREDICT] Invoice ${m.invoiceId ?? '?'} matches guardrail ${hits.map((h) => h.id).join(', ')}. ` +
            `Ask "What would you do with this one?" and do not hint at the answer.`,
        );
        break;
      }
    }
  });
}
