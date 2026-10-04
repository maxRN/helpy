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
// The question asked last (debrief): a question back about it is answered, then the answer is awaited again.
let asking: { questionId: string } | null = null;
// When the agent last started speaking (epoch ms), and what it is saying, to show it in the bubble meanwhile.
let agentStartedAt = 0;
let agentLine: string | null = null;
let teachback: {
  resolve: (r: { confirmed: boolean; correction?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
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

    onMessage: (msg) => {
      transcript?.ingest(msg);
      // What Helpy says is what the bubble shows, at the same time (Teach, debrief; not the long teach-back).
      const fromAgent = msg.source === 'ai' || (msg as { role?: string }).role === 'agent';
      const text = (msg.message ?? '').trim();
      if (!fromAgent || !text || teachback || m === 'capture') return;
      agentLine = text;
      if (agentSpeaking) showAgentLine(deps);
    },

    onModeChange: ({ mode: agentMode }) => {
      if (agentMode === 'speaking') {
        agentSpeaking = true;
        agentStartedAt = Date.now();
        if (agentLine) showAgentLine(deps);
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
  // Teach: the tutor never speaks up on its own. The Teach guide says the steps and the guardrail stop
  // (src/teach-ui/learningGuide.ts) and gives them to the agent as context; the agent answers the trainee.
}

/** The agent's current line into the bubble, once (bubble and voice say the same thing at the same time). */
function showAgentLine(deps: Deps): void {
  const line = agentLine;
  agentLine = null;
  if (line) (deps.mascot.spoken ?? deps.mascot.bubble)(line);
}

export async function stop(): Promise<void> {
  startGen++;
  asking = null;
  agentLine = null;
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

/**
 * Debrief: speak a question, resolve with the expert's reply when their turn ends.
 * `emitAnswer: false`: the reply is not logged as the answer yet (it may be a question back, see listenAgain).
 */
export async function ask(question: string, opts: { emitAnswer?: boolean } = {}): Promise<Quote> {
  const c = requireConn();
  const deps = getDeps();
  const qe = emit({ type: 'question_asked', speaker: 'agent', text: question, meta: { phase: mode } });
  asking = { questionId: qe.id };
  const answer = transcript!.expect({ questionId: qe.id, timeoutMs: 120_000, emit: opts.emitAnswer });
  deps.mascot.setState('speaking');
  deps.mascot.bubble(question);
  c.sendUserMessage(`[ASK] ${question}`);
  return answer;
}

/**
 * After a question back ("Wie meinst du das?"): wait for the next reply to the same question, without asking
 * it again. Listens once the agent finished explaining (or at once when it is quiet).
 */
export function listenAgain(opts: { emitAnswer?: boolean } = {}): Promise<Quote> {
  requireConn();
  if (!asking) return Promise.reject(new Error('[voice] no question asked'));
  return transcript!.expect({ questionId: asking.questionId, timeoutMs: 120_000, armed: true, agentSpeaking, emit: opts.emitAnswer });
}

/** The reply was the real answer to the last question: log it as such (see ask's emitAnswer). */
export function recordAnswer(q: Quote): void {
  if (!asking) return;
  emit({ type: 'answer_given', speaker: q.speaker, text: q.text, t: q.t, meta: { questionId: asking.questionId } });
  asking = null;
}

/** Did the agent start speaking at or after `since` (epoch ms)? E.g. it already explained its question itself. */
export const agentSpokeSince = (since: number): boolean => agentSpeaking || agentStartedAt >= since;

/** Resolves once the agent is not speaking (checked every 200 ms), at the latest after `maxMs`. */
export async function agentQuiet(maxMs = 30_000): Promise<void> {
  const end = Date.now() + maxMs;
  while (agentSpeaking && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
}

/** Teach: Helpy's own voice says a step (TTS): the agent must not hear it as the trainee talking. */
export function muteMic(on: boolean): void {
  try {
    conv?.setMicMuted(on);
  } catch (e) {
    console.warn('[voice] mute failed', e);
  }
}

/** Background context for the agent (no reply), e.g. "[GUIDE] Helpy told the trainee: ...". */
export function tellAgent(text: string): void {
  conv?.sendContextualUpdate(text);
}

/** True while the agent is talking. */
export const isAgentSpeaking = (): boolean => agentSpeaking;

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
    teachback = { resolve, timer, startedAt: nowRel() };
    emit({ type: 'teachback_given', speaker: 'agent', text });
    c.sendUserMessage(`[TEACHBACK] ${text}`);
  });
}

function settleTeachback(r: { confirmed: boolean; correction?: string }): void {
  if (!teachback) return;
  const t = teachback;
  teachback = null;
  clearTimeout(t.timer);
  // A correction is kept in the expert's own words (what they said after the teach-back), not the agent's
  // summary of it; the summary is the fallback when the transcript has nothing.
  const summary = r.correction;
  const own = !r.confirmed && summary && !summary.startsWith('(') ? (transcript?.userSince(t.startedAt) ?? []).join(' ').trim() : '';
  const result = own ? { ...r, correction: own } : r;
  emit({ type: 'teachback_result', speaker: 'expert', text: result.correction, meta: { confirmed: r.confirmed, agentSummary: summary } });
  t.resolve(result);
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

/** The expert declined the live question ("not now", heard by Scribe): it stays unanswered and is closed. */
export function noteSkipped(): void {
  policy?.recordSkip();
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
    // Scribe endpointing: the expert is talking until Scribe commits the turn, then a short breath (afterTurnMs).
    const endpointing = (deps.speech?.active() ?? false) && !!deps.speech?.turnOpen;
    return {
      now,
      lastTypingAt: deps.activity.lastTypingAt(),
      lastFieldAt: deps.activity.lastFieldAt?.(),
      userSilentForMs: now - lastSpeech,
      endpointing,
      turnOpen: endpointing ? deps.speech!.turnOpen!() : undefined,
      replyPending: deps.speech?.replyPending?.() ?? false,
      midTask: deps.midTask?.() ?? false,
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
